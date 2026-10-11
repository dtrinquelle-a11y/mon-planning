const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly } = require('../auth');

const ABS_LABELS = { conge_paye: 'congés payés', repos: 'repos', indisponibilite: 'indisponible', maladie: 'maladie', sans_solde: 'sans solde', autre: 'absence' };
const TOLERANCE_MIN = 5; // retard / depart anticipe signales au-dela de 5 minutes (meme regle que la pointeuse)

// Colonne DATE renvoyee par pg (Date a minuit heure locale du serveur) -> AAAA-MM-JJ
const dateStr = v => v instanceof Date
  ? v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0')
  : String(v).slice(0, 10);
const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const hhmm = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

// Compare, pour un salarie et un jour, les creneaux prevus et les intervalles pointes (minutes depuis minuit)
// decl : declarations du jour (pointeuse desactivee) ; declarative : mode "horaires declares" actif
function compareDay(planned, actual, decl = [], declarative = false) {
  const out = { anomalies: [] };
  const pl = planned.map(s => {
    const start = toMin(s.start_time); let end = toMin(s.end_time); if (end <= start) end += 1440;
    return { start, end, brk: parseInt(s.break_minutes, 10) || 0 };
  }).sort((a, b) => a.start - b.start);
  const plannedMin = pl.reduce((n, s) => n + Math.max(0, s.end - s.start - s.brk), 0);
  // Pause : celle declaree par le salarie si les horaires ont ete declares, sinon celle prevue
  const plannedBreak = decl.length ? decl.reduce((n, d) => n + (parseInt(d.break_minutes, 10) || 0), 0) : pl.reduce((n, s) => n + s.brk, 0);
  const closed = actual.filter(i => i.out !== null);
  const grossMin = closed.reduce((n, i) => n + (i.out - i.in), 0);
  // Les pauses ne sont pas pointees : on deduit la pause prevue du temps pointe pour comparer a l'identique
  const workedMin = closed.length ? Math.max(0, grossMin - plannedBreak) : 0;

  out.planned = pl.length ? hhmm(pl[0].start) + '-' + hhmm(pl[pl.length - 1].end) : null;
  out.actual = actual.length ? actual.map(i => hhmm(i.in) + '-' + (i.out === null ? '?' : hhmm(i.out))).join(' / ') : null;
  // Photos prises au pointage (chemins dans le stockage, affichees en miniature par l'application)
  out.photos = actual.flatMap(i => [
    i.photoIn ? { label: 'Arrivée ' + hhmm(i.in), path: i.photoIn } : null,
    i.photoOut ? { label: 'Départ ' + hhmm(i.out), path: i.photoOut } : null,
  ]).filter(Boolean);
  out.planned_min = plannedMin;
  out.worked_min = workedMin;

  // Horaires declares (pointeuse desactivee)
  out.declared = decl.length > 0;
  decl.forEach(d => {
    if (d.status === 'modifie') out.anomalies.push({ code: 'declare_modifie', label: 'Horaires modifiés par le salarié' + (d.comment ? ' : « ' + d.comment + ' »' : '') });
    if (d.status === 'non_travaille') out.anomalies.push({ code: 'declare_non_travaille', label: 'Déclaré non travaillé' + (d.comment ? ' : « ' + d.comment + ' »' : '') });
    if (d.status === 'auto') out.anomalies.push({ code: 'declare_auto', label: 'Non validé par le salarié (prévu retenu)' });
    if (d.revisions > 0) {
      const f = d.first;
      const initial = !f ? '' : f.status === 'non_travaille' ? 'non travaillé' : (f.status === 'conforme' ? 'validé ' : 'modifié ') + f.start + '-' + f.end;
      out.anomalies.push({ code: 'declare_revise', label: 'Déclaration revue par le salarié' + (d.revisions > 1 ? ' (' + d.revisions + ' fois)' : '') + (initial ? ' · d\'abord : ' + initial : '') });
    }
  });
  const declaredOff = decl.length > 0 && decl.every(d => d.status === 'non_travaille');
  if (pl.length && !actual.length && !declaredOff) out.anomalies.push(declarative && !decl.length
    ? { code: 'a_valider', label: 'Horaires pas encore validés' }
    : { code: 'absent', label: 'Aucun pointage' });
  if (!pl.length && actual.length) out.anomalies.push({ code: 'hors_planning', label: 'Pointage sans créneau prévu' });
  if (actual.some(i => i.out === null)) out.anomalies.push({ code: 'oubli_depart', label: 'Départ non pointé' });
  if (actual.some(i => i.in === null)) out.anomalies.push({ code: 'oubli_arrivee', label: 'Arrivée non pointée' });
  if (pl.length && closed.length) {
    const firstIn = Math.min(...actual.filter(i => i.in !== null).map(i => i.in));
    const lastOut = Math.max(...closed.map(i => i.out));
    const late = firstIn - pl[0].start;
    const early = pl[pl.length - 1].end - lastOut;
    if (late > TOLERANCE_MIN) out.anomalies.push({ code: 'retard', label: 'Retard de ' + late + ' min', minutes: late });
    if (early > TOLERANCE_MIN) out.anomalies.push({ code: 'depart_anticipe', label: 'Départ ' + early + ' min plus tôt', minutes: early });
  }
  return out;
}

// GET /api/reports/realise?week=AAAA-MM-JJ (lundi) -> prevu / pointe par salarie et par jour
router.get('/realise', managerOnly, async (req, res) => {
  const week = req.query.week;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week || '')) return res.status(400).json({ error: 'Parametre week (AAAA-MM-JJ) requis' });
  try {
    const [emps, shifts, scans, decls, mode] = await Promise.all([
      pool.query('SELECT id, first_name, last_name, service, is_active, is_temp FROM employees'),
      pool.query(`SELECT employee_id, work_date, start_time, end_time, break_minutes FROM schedules
                  WHERE work_date >= $1::date AND work_date < $1::date + 7 AND shift_type NOT IN ('repos', 'recup')`, [week]),
      // Pointages de la semaine (heure de Paris), avec la journee precedente pour un depart apres minuit
      pool.query(`SELECT employee_id, action,
                    to_char(scanned_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                    EXTRACT(HOUR FROM scanned_at AT TIME ZONE 'Europe/Paris') * 60 + EXTRACT(MINUTE FROM scanned_at AT TIME ZONE 'Europe/Paris') AS minute,
                    scanned_at, photo_path
                  FROM timeclock
                  WHERE scanned_at AT TIME ZONE 'Europe/Paris' >= $1::date - 1 AND scanned_at AT TIME ZONE 'Europe/Paris' < $1::date + 8
                  ORDER BY employee_id, scanned_at`, [week]),
      // Declarations de la semaine, avec la toute premiere reponse du salarie s'il est revenu dessus
      pool.query(`SELECT w.employee_id, w.work_date, w.status, w.break_minutes, w.comment, w.revisions,
                    (SELECT json_build_object('status', h.status, 'start', to_char(h.start_time, 'HH24:MI'), 'end', to_char(h.end_time, 'HH24:MI'))
                       FROM work_declaration_history h WHERE h.declaration_id = w.id AND NOT h.by_manager
                      ORDER BY h.declared_at LIMIT 1) AS first
                  FROM work_declarations w
                  WHERE w.work_date >= $1::date AND w.work_date < $1::date + 7`, [week]),
      pool.query('SELECT public.timeclock_enabled() AS enabled'),
    ]);
    const declarative = !mode.rows[0].enabled;
    const declBy = {};
    decls.rows.forEach(d => { const k = d.employee_id + '|' + dateStr(d.work_date); (declBy[k] = declBy[k] || []).push(d); });

    // Intervalles pointes par salarie et par jour d'arrivee : arrivee + depart suivant (moins de 24 h)
    const intervals = {}; // empId -> day -> [{in, out}]
    const push = (emp, day, iv) => { ((intervals[emp] = intervals[emp] || {})[day] = intervals[emp][day] || []).push(iv); };
    const byEmp = {};
    scans.rows.forEach(r => (byEmp[r.employee_id] = byEmp[r.employee_id] || []).push(r));
    for (const [emp, list] of Object.entries(byEmp)) {
      for (let k = 0; k < list.length; k++) {
        const s = list[k], n = list[k + 1];
        const m = parseInt(s.minute, 10);
        if (s.action === 'in') {
          if (n && n.action === 'out' && new Date(n.scanned_at) - new Date(s.scanned_at) < 24 * 3600 * 1000) {
            const nm = parseInt(n.minute, 10) + (n.day !== s.day ? 1440 : 0);
            push(emp, s.day, { in: m, out: nm, photoIn: s.photo_path, photoOut: n.photo_path }); k++;
          } else push(emp, s.day, { in: m, out: null, photoIn: s.photo_path });
        } else push(emp, s.day, { in: null, out: m, photoOut: s.photo_path });
      }
    }

    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(week + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
    const plannedBy = {};
    shifts.rows.forEach(s => { const d = dateStr(s.work_date); ((plannedBy[s.employee_id] = plannedBy[s.employee_id] || {})[d] = plannedBy[s.employee_id][d] || []).push(s); });

    const rows = [];
    for (const e of emps.rows) {
      const p = plannedBy[e.id] || {}, a = intervals[e.id] || {};
      if (!days.some(d => p[d] || a[d])) continue; // ni prevu ni pointe cette semaine
      const perDay = {};
      let planned = 0, worked = 0, anomalies = 0, late = 0;
      for (const d of days) {
        if (!p[d] && !a[d]) continue;
        const c = compareDay(p[d] || [], a[d] || [], declBy[e.id + '|' + d] || [], declarative);
        perDay[d] = c;
        planned += c.planned_min; worked += c.worked_min; anomalies += c.anomalies.length;
        late += c.anomalies.filter(x => x.code === 'retard').length;
      }
      rows.push({ employee_id: e.id, nom: e.last_name || '', prenom: e.first_name || '', service: e.service,
        days: perDay, planned_min: planned, worked_min: worked, anomalies, retards: late });
    }
    rows.sort((x, y) => (x.service || '').localeCompare(y.service || '') || x.nom.localeCompare(y.nom));
    res.json({ week, days, tolerance: TOLERANCE_MIN, declarative, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/today -> activite du jour : statut de chaque salarie prevu, alertes, connexions
router.get('/today', managerOnly, async (req, res) => {
  try {
    const { rows: [t] } = await pool.query(`SELECT to_char(now() AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
      (EXTRACT(HOUR FROM now() AT TIME ZONE 'Europe/Paris') * 60 + EXTRACT(MINUTE FROM now() AT TIME ZONE 'Europe/Paris'))::int AS minute`);
    const day = t.day, nowMin = t.minute;
    const [emps, shifts, scans, decls, absences, pendingAbs, revised, logins, mode] = await Promise.all([
      pool.query('SELECT id, first_name, last_name, service, is_active, is_temp FROM employees'),
      pool.query(`SELECT employee_id, start_time, end_time FROM schedules
                  WHERE work_date = $1::date AND shift_type NOT IN ('repos', 'recup', 'off') ORDER BY start_time`, [day]),
      pool.query(`SELECT employee_id, action, geo_valid, latitude, declaration_id,
                    (EXTRACT(HOUR FROM scanned_at AT TIME ZONE 'Europe/Paris') * 60 + EXTRACT(MINUTE FROM scanned_at AT TIME ZONE 'Europe/Paris'))::int AS minute
                  FROM timeclock WHERE (scanned_at AT TIME ZONE 'Europe/Paris')::date = $1::date ORDER BY scanned_at`, [day]),
      pool.query(`SELECT employee_id, status, to_char(start_time, 'HH24:MI') AS s, to_char(end_time, 'HH24:MI') AS e, revisions
                  FROM work_declarations WHERE work_date = $1::date`, [day]),
      pool.query(`SELECT employee_id, type FROM absence_requests WHERE status = 'acceptee' AND $1::date BETWEEN start_date AND end_date`, [day]),
      pool.query(`SELECT count(*)::int AS n FROM absence_requests WHERE status = 'en_attente'`),
      // Horaires modifies aujourd'hui par les salaries (quelle que soit la journee concernee)
      pool.query(`SELECT employee_id, work_date, status, revisions, to_char(start_time, 'HH24:MI') AS s, to_char(end_time, 'HH24:MI') AS e, comment,
                    to_char(declared_at AT TIME ZONE 'Europe/Paris', 'HH24:MI') AS at
                  FROM work_declarations
                  WHERE NOT by_manager AND (status IN ('modifie', 'non_travaille') OR revisions > 0)
                    AND (declared_at AT TIME ZONE 'Europe/Paris')::date = $1::date
                  ORDER BY declared_at DESC`, [day]),
      pool.query('SELECT * FROM public.employees_last_sign_in()'),
      pool.query('SELECT public.timeclock_enabled() AS enabled'),
    ]);
    const declarative = !mode.rows[0].enabled;
    const empBy = Object.fromEntries(emps.rows.map(e => [e.id, e]));
    const name = id => empBy[id] ? empBy[id].first_name + ' ' + (empBy[id].last_name || '') : 'Salarié';
    const loginBy = Object.fromEntries(logins.rows.map(l => [l.employee_id, l.last_sign_in_at]));
    const absBy = Object.fromEntries(absences.rows.map(a => [a.employee_id, a.type]));
    const declBy = {};
    decls.rows.forEach(d => (declBy[d.employee_id] = declBy[d.employee_id] || []).push(d));
    const scansBy = {};
    scans.rows.filter(s => !s.declaration_id).forEach(s => (scansBy[s.employee_id] = scansBy[s.employee_id] || []).push(s));

    // Creneaux du jour regroupes par salarie (premier debut, derniere fin)
    const plan = {};
    shifts.rows.forEach(s => {
      const start = toMin(s.start_time); let end = toMin(s.end_time); if (end <= start) end += 1440;
      const p = plan[s.employee_id] = plan[s.employee_id] || { start, end, ranges: [] };
      p.start = Math.min(p.start, start); p.end = Math.max(p.end, end);
      p.ranges.push(hhmm(start) + '-' + hhmm(end));
    });

    const alerts = [];
    const alert = (severity, code, employee_id, label, time) => alerts.push({ severity, code, employee_id, name: name(employee_id), service: empBy[employee_id]?.service, label, time });
    const people = Object.entries(plan).map(([id, p]) => {
      const sc = scansBy[id] || [];
      const ins = sc.filter(s => s.action === 'in'), outs = sc.filter(s => s.action === 'out');
      const last = sc[sc.length - 1];
      const firstIn = ins.length ? ins[0].minute : null;
      const lastOut = outs.length ? outs[outs.length - 1].minute : null;
      const login = loginBy[id] || null;
      const loggedToday = !!login && new Date(login).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' }) === day;
      let status;
      if (absBy[id]) status = { code: 'absent', label: 'Absent (' + (ABS_LABELS[absBy[id]] || 'absence') + ')' };
      else if (declarative) {
        const d = declBy[id];
        if (d && d.length) status = { code: 'declare_' + d[0].status, label: d[0].status === 'non_travaille' ? 'Déclaré non travaillé' : 'Validé ' + d[0].s + '-' + d[0].e + (d[0].status === 'modifie' ? ' (modifié)' : '') };
        else if (nowMin >= p.end - 30) status = { code: 'a_valider', label: 'Horaires à valider' };
        else if (nowMin >= p.start) status = { code: 'en_cours', label: 'En service (prévu)' };
        else status = { code: 'a_venir', label: 'Prévu à ' + hhmm(p.start) };
      } else {
        if (last && last.action === 'in') status = { code: 'en_poste', label: 'En poste depuis ' + hhmm(last.minute) };
        else if (last && last.action === 'out') status = { code: 'parti', label: 'Départ à ' + hhmm(last.minute) };
        else if (nowMin >= p.start + TOLERANCE_MIN) status = { code: 'pas_arrive', label: 'Pas encore pointé' };
        else status = { code: 'a_venir', label: 'Prévu à ' + hhmm(p.start) };
        // Alertes de pointage
        if (status.code === 'pas_arrive') alert('red', 'pas_arrive', id, "N'a pas pointé son arrivée (prévu " + hhmm(p.start) + ')', hhmm(p.start));
        if (firstIn !== null && firstIn - p.start > TOLERANCE_MIN) alert('amber', 'retard', id, 'Arrivée pointée à ' + hhmm(firstIn) + ' au lieu de ' + hhmm(p.start) + ' (+' + (firstIn - p.start) + ' min)', hhmm(firstIn));
        if (last && last.action === 'in' && nowMin > p.end + 30 && p.end < 1440) alert('red', 'oubli_depart', id, 'Départ non pointé (fin prévue ' + hhmm(p.end) + ')', hhmm(p.end));
        if (last && last.action === 'out' && p.end - lastOut > TOLERANCE_MIN && nowMin < p.end + 240) alert('amber', 'depart_anticipe', id, 'Départ pointé à ' + hhmm(lastOut) + ' au lieu de ' + hhmm(p.end), hhmm(lastOut));
      }
      return { employee_id: id, name: name(id), service: empBy[id]?.service || '', planned: p.ranges.join(' / '), start: p.start,
        arrived: firstIn !== null ? hhmm(firstIn) : null, left: last && last.action === 'out' ? hhmm(lastOut) : null,
        status, last_seen: login, logged_today: loggedToday };
    }).sort((a, b) => a.start - b.start || a.name.localeCompare(b.name));

    // Pointages hors site et pointages sans creneau prevu
    scans.rows.filter(s => !s.declaration_id && s.latitude != null && s.geo_valid === false)
      .forEach(s => alert('red', 'hors_site', s.employee_id, 'Pointage hors du site (' + (s.action === 'in' ? 'arrivée' : 'départ') + ')', hhmm(s.minute)));
    Object.keys(scansBy).filter(id => !plan[id]).forEach(id => alert('purple', 'hors_planning', id, 'A pointé sans créneau prévu aujourd\'hui', hhmm(scansBy[id][0].minute)));
    // Horaires declares modifies aujourd'hui par les salaries
    revised.rows.forEach(w => {
      const dayLabel = dateStr(w.work_date) === day ? "aujourd'hui" : 'le ' + dateStr(w.work_date).split('-').reverse().slice(0, 2).join('/');
      const what = w.status === 'non_travaille' ? 'déclaré non travaillé' : 'déclaré ' + w.s + '-' + w.e;
      alert('pink', 'horaires_modifies', w.employee_id, (w.revisions > 0 ? 'Revient sur sa déclaration' : 'A modifié ses horaires') + ' (' + dayLabel + ' : ' + what + ')' + (w.comment ? ' « ' + w.comment + ' »' : ''), w.at);
    });
    const order = { red: 0, pink: 1, amber: 2, purple: 3 };
    alerts.sort((a, b) => order[a.severity] - order[b.severity] || String(a.time).localeCompare(String(b.time)));

    const working = people.filter(p => p.status.code !== 'absent');
    res.json({
      day, now: hhmm(nowMin), declarative, people, alerts,
      pending_absences: pendingAbs.rows[0].n,
      not_connected: working.filter(p => !p.logged_today).map(p => ({ employee_id: p.employee_id, name: p.name, service: p.service, last_seen: p.last_seen })),
      counts: {
        planned: people.length,
        absent: people.length - working.length,
        present: working.filter(p => ['en_poste', 'parti', 'en_cours'].includes(p.status.code) || p.status.code.startsWith('declare_')).length,
        waiting: working.filter(p => ['pas_arrive', 'a_valider'].includes(p.status.code)).length,
        alerts: alerts.length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.compareDay = compareDay;
