const { pool, TZ } = require('../db');
const { sendWeekToConfirm } = require('../email');

// Pointeuse desactivee (mode "horaires declares") :
// - dimanche 18 h (heure de Paris) : email a chaque salarie avec le recapitulatif de sa semaine et les journees a valider ;
// - lundi 12 h : la semaine est cloturee (regle dans la base) et les creneaux non valides sont retenus tels que prevus.

const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const STATUS = { conforme: 'Valide', modifie: 'Valide (modifie)', non_travaille: 'Non travaille', auto: 'Prevu retenu' };
const hm = t => String(t).slice(0, 5);
// Colonne DATE renvoyee par pg (Date a minuit heure locale du serveur) -> AAAA-MM-JJ
const dateStr = v => v instanceof Date
  ? v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0')
  : String(v).slice(0, 10);
const frShort = iso => { const d = new Date(iso + 'T12:00:00Z'); return JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + '/' + String(d.getUTCMonth() + 1).padStart(2, '0'); };

function parisNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { day: p.year + '-' + p.month + '-' + p.day, hour: parseInt(p.hour, 10) % 24, weekday: p.weekday };
}

async function sendSundayEmails(sunday) {
  const monday = new Date(sunday + 'T12:00:00Z'); monday.setUTCDate(monday.getUTCDate() - 6);
  const mondayIso = monday.toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `SELECT e.id, e.first_name, e.last_name, e.email, s.work_date, s.start_time, s.end_time,
            w.status, w.start_time AS d_start, w.end_time AS d_end
       FROM schedules s
       JOIN employees e ON e.id = s.employee_id
       LEFT JOIN work_declarations w ON w.schedule_id = s.id
      WHERE s.work_date BETWEEN $1::date AND $2::date AND s.shift_type NOT IN ('repos', 'recup', 'off')
        AND e.is_active AND NOT COALESCE(e.is_temp, false)
        AND NOT EXISTS (SELECT 1 FROM absence_requests a WHERE a.employee_id = s.employee_id AND a.status = 'acceptee'
                          AND s.work_date BETWEEN a.start_date AND a.end_date)
      ORDER BY e.id, s.work_date, s.start_time`, [mondayIso, sunday]);
  const byEmp = {};
  rows.forEach(r => (byEmp[r.id] = byEmp[r.id] || { e: r, days: [] }).days.push(r));
  const weekLabel = frShort(mondayIso) + ' au ' + frShort(sunday);
  let sent = 0;
  for (const { e, days } of Object.values(byEmp)) {
    if (!e.email || e.email.endsWith('@temp.fr')) continue;
    const list = days.map(d => ({
      day: frShort(dateStr(d.work_date)),
      hours: d.status === 'non_travaille' ? '—' : d.status ? hm(d.d_start) + ' - ' + hm(d.d_end) : hm(d.start_time) + ' - ' + hm(d.end_time) + ' (prevu)',
      status: d.status ? STATUS[d.status] : 'A valider',
      ok: !!d.status,
    }));
    const pending = list.filter(d => !d.ok).length;
    if (await sendWeekToConfirm({ to: e.email, employeeName: e.first_name + ' ' + e.last_name, weekLabel, days: list, pending, lockLabel: 'lundi a 12 h' })) sent++;
  }
  console.log('[Horaires] Recapitulatif du dimanche envoye a ' + sent + ' salarie(s)');
}

async function runDeclarationsJob() {
  const { rows: on } = await pool.query('SELECT public.timeclock_enabled() AS enabled');
  if (on[0].enabled) return; // pointeuse en service : rien a faire

  // Semaines cloturees : creneaux non valides retenus tels que prevus
  const { rows } = await pool.query('SELECT public.auto_confirm_declarations() AS n');
  if (rows[0].n > 0) console.log('[Horaires] ' + rows[0].n + ' creneau(x) non valide(s) retenu(s) tels que prevus');

  // Dimanche 18 h : un seul envoi par dimanche (memorise dans les reglages, resiste a un redemarrage)
  const now = parisNow();
  if (now.weekday !== 'Sun' || now.hour !== 18) return;
  const { rows: last } = await pool.query("SELECT value FROM app_settings WHERE key = 'horaires_dernier_envoi'");
  if (last[0] && last[0].value === now.day) return;
  await pool.query(
    `INSERT INTO app_settings (key, value, label, updated_at) VALUES ('horaires_dernier_envoi', $1::jsonb, 'Dernier recapitulatif horaires', now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(now.day)]);
  await sendSundayEmails(now.day);
}

function startDeclarationsJob() {
  const run = () => runDeclarationsJob().catch(err => console.error('[Horaires] Erreur :', err.message));
  setTimeout(run, 2 * 60 * 1000);
  setInterval(run, 10 * 60 * 1000);
}

module.exports = { startDeclarationsJob, runDeclarationsJob, sendSundayEmails };
