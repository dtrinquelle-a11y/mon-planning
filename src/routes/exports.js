const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly } = require('../auth');

// ---------- Utilitaires de dates (chaines AAAA-MM-JJ, calculs en UTC pour eviter les decalages) ----------
const D = iso => new Date(iso + 'T00:00:00Z');
const iso = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
// Colonne DATE renvoyee par pg (Date a minuit heure locale du serveur) -> AAAA-MM-JJ
const dateStr = v => v instanceof Date
  ? v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0')
  : String(v).slice(0, 10);

// Jours feries francais d'une annee (Paques par l'algorithme de Meeus)
function holidays(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = D(year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
  return new Set([
    year + '-01-01', iso(addDays(easter, 1)), year + '-05-01', year + '-05-08', iso(addDays(easter, 39)),
    iso(addDays(easter, 50)), year + '-07-14', year + '-08-15', year + '-11-01', year + '-11-11', year + '-12-25',
  ]);
}

// Creneau -> minutes de travail net, et minutes de nuit (21h-6h)
function shiftMinutes(s) {
  const toMin = t => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m; };
  const start = toMin(s.start_time);
  let end = toMin(s.end_time);
  if (end <= start) end += 24 * 60;
  const net = Math.max(0, end - start - (parseInt(s.break_minutes, 10) || 0));
  // Minutes de nuit : intersection avec [21h, 30h] (21h-6h le lendemain) et [-3h, 6h] (minuit-6h le jour meme)
  const inter = (a, b) => Math.max(0, Math.min(end, b) - Math.max(start, a));
  const night = inter(-3 * 60, 6 * 60) + inter(21 * 60, 30 * 60);
  return { net, night: Math.min(night, net) };
}

const h2 = min => Math.round(min / 60 * 100) / 100;

// GET /api/exports/paie?month=AAAA-MM  -> elements variables de paie par salarie
router.get('/paie', managerOnly, async (req, res) => {
  const month = req.query.month;
  if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'Parametre month (AAAA-MM) requis' });
  const first = D(month + '-01');
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const last = addDays(next, -1);
  // Semaines (lundi-dimanche) qui touchent le mois ; une semaine est rattachee au mois de son jeudi (convention ISO)
  const firstMonday = addDays(first, -((first.getUTCDay() + 6) % 7));
  const lastSunday = addDays(last, (7 - last.getUTCDay()) % 7);
  const ferie = new Set([...holidays(first.getUTCFullYear()), ...holidays(last.getUTCFullYear())]);

  try {
    const [emps, shifts, worked, lates, modul] = await Promise.all([
      pool.query(`SELECT id, first_name, last_name, service, contract_type, contract_hours, is_active, is_temp
                  FROM employees ORDER BY service, last_name, first_name`),
      pool.query(`SELECT employee_id, work_date, start_time, end_time, break_minutes, shift_type FROM schedules
                  WHERE work_date >= $1 AND work_date <= $2 AND shift_type <> 'repos'`, [iso(firstMonday), iso(lastSunday)]),
      // Heures realisees : chaque arrivee est appariee au pointage suivant s'il s'agit d'un depart
      pool.query(`
        WITH scans AS (
          SELECT employee_id, action, scanned_at, scanned_at AT TIME ZONE 'Europe/Paris' AS local_at,
                 LEAD(action) OVER w AS next_action, LEAD(scanned_at) OVER w AS next_at
          FROM timeclock
          WHERE scanned_at AT TIME ZONE 'Europe/Paris' >= $1::date - 1 AND scanned_at AT TIME ZONE 'Europe/Paris' < $2::date + 1
          WINDOW w AS (PARTITION BY employee_id ORDER BY scanned_at))
        SELECT employee_id, SUM(EXTRACT(EPOCH FROM (next_at - scanned_at)) / 60) AS minutes
        FROM scans WHERE action = 'in' AND next_action = 'out' AND next_at - scanned_at < INTERVAL '24 hours'
          AND local_at >= $1::date AND local_at < $2::date
        GROUP BY employee_id`, [iso(first), iso(next)]),
      pool.query(`SELECT employee_id, COUNT(*) AS n FROM timeclock
                  WHERE is_late AND scanned_at AT TIME ZONE 'Europe/Paris' >= $1::date AND scanned_at AT TIME ZONE 'Europe/Paris' < $2::date
                  GROUP BY employee_id`, [iso(first), iso(next)]),
      pool.query(`SELECT employee_id, worked_hours FROM modulation_counter WHERE period_start <= $1 AND period_end >= $1`, [iso(last)]),
    ]);

    const workedBy = Object.fromEntries(worked.rows.map(r => [r.employee_id, parseFloat(r.minutes)]));
    const latesBy = Object.fromEntries(lates.rows.map(r => [r.employee_id, parseInt(r.n, 10)]));
    const modBy = Object.fromEntries(modul.rows.map(r => [r.employee_id, parseFloat(r.worked_hours)]));
    const byEmp = {};
    shifts.rows.forEach(s => { (byEmp[s.employee_id] = byEmp[s.employee_id] || []).push(s); });

    const rows = [];
    for (const e of emps.rows) {
      const list = byEmp[e.id] || [];
      const hasMonthShift = list.some(s => { const d = dateStr(s.work_date); return d >= iso(first) && d <= iso(last); });
      // Salaries actifs (hors equipiers temporaires) + toute personne ayant travaille ce mois-ci
      if (!hasMonthShift && (!e.is_active || e.is_temp)) continue;

      const contract = parseFloat(e.contract_hours) || 35;
      let planned = 0, night = 0, sunMin = 0, ferMin = 0;
      const sunDays = new Set(), ferDays = new Set(), weekMin = {};
      for (const s of list) {
        const d = dateStr(s.work_date);
        const { net, night: nm } = shiftMinutes(s);
        // Semaine du creneau (lundi) : pour les heures au-dela du contrat
        const dd = D(d), monday = iso(addDays(dd, -((dd.getUTCDay() + 6) % 7)));
        weekMin[monday] = (weekMin[monday] || 0) + net;
        if (d < iso(first) || d > iso(last)) continue;
        planned += net; night += nm;
        if (dd.getUTCDay() === 0) { sunDays.add(d); sunMin += net; }
        if (ferie.has(d)) { ferDays.add(d); ferMin += net; }
      }
      const weeks = Object.entries(weekMin)
        .filter(([monday]) => { const thu = iso(addDays(D(monday), 3)); return thu >= iso(first) && thu <= iso(last); })
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([monday, min]) => ({ monday, heures: h2(min), au_dela: h2(Math.max(0, min - contract * 60)) }));

      rows.push({
        employee_id: e.id, nom: e.last_name || '', prenom: e.first_name || '', service: e.service,
        contrat: e.contract_type, heures_contrat: contract, temporaire: !!e.is_temp,
        heures_planifiees: h2(planned),
        heures_realisees: workedBy[e.id] !== undefined ? h2(workedBy[e.id]) : null,
        heures_au_dela_contrat: Math.round(weeks.reduce((n, w) => n + w.au_dela, 0) * 100) / 100,
        semaines: weeks,
        dimanches_jours: sunDays.size, dimanches_heures: h2(sunMin),
        feries_jours: ferDays.size, feries_heures: h2(ferMin),
        nuit_heures: h2(night),
        retards: latesBy[e.id] || 0,
        modulation_cumul: modBy[e.id] !== undefined ? Math.round(modBy[e.id] * 100) / 100 : null,
      });
    }
    res.json({ month, du: iso(first), au: iso(last), rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.holidays = holidays;
module.exports.shiftMinutes = shiftMinutes;
