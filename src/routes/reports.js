const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly } = require('../auth');

const TOLERANCE_MIN = 5; // retard / depart anticipe signales au-dela de 5 minutes (meme regle que la pointeuse)

// Colonne DATE renvoyee par pg (Date a minuit heure locale du serveur) -> AAAA-MM-JJ
const dateStr = v => v instanceof Date
  ? v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0')
  : String(v).slice(0, 10);
const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
const hhmm = min => String(Math.floor(min / 60) % 24).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');

// Compare, pour un salarie et un jour, les creneaux prevus et les intervalles pointes (minutes depuis minuit)
function compareDay(planned, actual) {
  const out = { anomalies: [] };
  const pl = planned.map(s => {
    const start = toMin(s.start_time); let end = toMin(s.end_time); if (end <= start) end += 1440;
    return { start, end, brk: parseInt(s.break_minutes, 10) || 0 };
  }).sort((a, b) => a.start - b.start);
  const plannedMin = pl.reduce((n, s) => n + Math.max(0, s.end - s.start - s.brk), 0);
  const plannedBreak = pl.reduce((n, s) => n + s.brk, 0);
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

  if (pl.length && !actual.length) out.anomalies.push({ code: 'absent', label: 'Aucun pointage' });
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
    const [emps, shifts, scans] = await Promise.all([
      pool.query('SELECT id, first_name, last_name, service, is_active, is_temp FROM employees'),
      pool.query(`SELECT employee_id, work_date, start_time, end_time, break_minutes FROM schedules
                  WHERE work_date >= $1::date AND work_date < $1::date + 7 AND shift_type <> 'repos'`, [week]),
      // Pointages de la semaine (heure de Paris), avec la journee precedente pour un depart apres minuit
      pool.query(`SELECT employee_id, action,
                    to_char(scanned_at AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD') AS day,
                    EXTRACT(HOUR FROM scanned_at AT TIME ZONE 'Europe/Paris') * 60 + EXTRACT(MINUTE FROM scanned_at AT TIME ZONE 'Europe/Paris') AS minute,
                    scanned_at, photo_path
                  FROM timeclock
                  WHERE scanned_at AT TIME ZONE 'Europe/Paris' >= $1::date - 1 AND scanned_at AT TIME ZONE 'Europe/Paris' < $1::date + 8
                  ORDER BY employee_id, scanned_at`, [week]),
    ]);

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
        const c = compareDay(p[d] || [], a[d] || []);
        perDay[d] = c;
        planned += c.planned_min; worked += c.worked_min; anomalies += c.anomalies.length;
        late += c.anomalies.filter(x => x.code === 'retard').length;
      }
      rows.push({ employee_id: e.id, nom: e.last_name || '', prenom: e.first_name || '', service: e.service,
        days: perDay, planned_min: planned, worked_min: worked, anomalies, retards: late });
    }
    rows.sort((x, y) => (x.service || '').localeCompare(y.service || '') || x.nom.localeCompare(y.nom));
    res.json({ week, days, tolerance: TOLERANCE_MIN, rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.compareDay = compareDay;
