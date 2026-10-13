const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly, requirePerm } = require('../auth');

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

// Avantage en nature logement : bareme forfaitaire Urssaf 2026 (modifiable dans Parametrage > Logement)
// Tranches de remuneration brute mensuelle en fraction du plafond mensuel de la securite sociale (PMSS)
const LOGEMENT_DEFAULTS = {
  pmss: 4005,
  une_piece: [79.70, 93.00, 106.20, 119.40, 146.40, 172.60, 199.40, 225.60],
  par_piece: [42.60, 59.70, 79.70, 99.50, 126.10, 152.40, 185.70, 212.30],
};
const TRANCHES = [0.5, 0.6, 0.7, 0.9, 1.1, 1.3, 1.5];
function logementForfait(cfg, salaireMensuel, pieces) {
  const c = { ...LOGEMENT_DEFAULTS, ...(cfg || {}) };
  const pmss = parseFloat(c.pmss) || LOGEMENT_DEFAULTS.pmss;
  let t = 0;
  while (t < TRANCHES.length && salaireMensuel >= TRANCHES[t] * pmss) t++;
  const n = Math.max(1, parseInt(pieces, 10) || 1);
  return n === 1 ? parseFloat(c.une_piece[t]) : parseFloat(c.par_piece[t]) * n;
}

// GET /api/exports/paie?month=AAAA-MM  -> elements variables de paie par salarie
router.get('/paie', managerOnly, requirePerm('paie'), async (req, res) => {
  const month = req.query.month;
  if (!/^\d{4}-\d{2}$/.test(month || '')) return res.status(400).json({ error: 'Parametre month (AAAA-MM) requis' });
  const first = D(month + '-01');
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const last = addDays(next, -1);
  // Semaines (lundi-dimanche) qui touchent le mois ; une semaine est rattachee au mois de son jeudi (convention ISO)
  const firstMonday = addDays(first, -((first.getUTCDay() + 6) % 7));
  const lastSunday = addDays(last, (7 - last.getUTCDay()) % 7);
  const ferie = new Set([...holidays(first.getUTCFullYear()), ...holidays(last.getUTCFullYear())]);
  // Debut de la periode de modulation (1er novembre) contenant le mois
  const periodStart = (first.getUTCMonth() >= 10 ? first.getUTCFullYear() : first.getUTCFullYear() - 1) + '-11-01';

  try {
    const [emps, shifts, worked, lates, modul, recupPeriod] = await Promise.all([
      pool.query(`SELECT id, first_name, last_name, service, contract_type, contract_hours, hire_date, contract_end_date, is_active, is_temp,
                         logement, logement_pieces, salaire_horaire, coefficient
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
      // Creneaux de recuperation depuis le debut de la periode de modulation jusqu'a la fin du mois
      pool.query(`SELECT employee_id, start_time, end_time, break_minutes FROM schedules
                  WHERE shift_type = 'recup' AND work_date >= $1 AND work_date <= $2`, [periodStart, iso(last)]),
    ]);
    const { rows: cfgRows } = await pool.query("SELECT key, value FROM app_settings WHERE key IN ('logement', 'cc_hpa')");
    const cfgOf = k => (cfgRows.find(r => r.key === k) || {}).value || {};
    const logementCfg = cfgOf('logement'), cc = cfgOf('cc_hpa');
    const base = parseFloat(cc.salaire_base) || 1858.92, point = parseFloat(cc.valeur_point) || 5.63;
    const daysInMonth = Math.round((next - first) / 86400000);

    const recupCumulBy = {};
    recupPeriod.rows.forEach(s => { recupCumulBy[s.employee_id] = (recupCumulBy[s.employee_id] || 0) + shiftMinutes(s).net; });

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
      let planned = 0, night = 0, sunMin = 0, ferMin = 0, recupMin = 0;
      const sunDays = new Set(), ferDays = new Set(), weekMin = {};
      for (const s of list) {
        const d = dateStr(s.work_date);
        const { net, night: nm } = shiftMinutes(s);
        if (s.shift_type === 'recup') { if (d >= iso(first) && d <= iso(last)) recupMin += net; continue; }
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

      // Logement fourni : forfait du mois, ou par semaine commencee si le salarie n'est loge qu'une partie du mois
      // (une semaine = 1/4 du forfait mensuel, plafonne au forfait)
      let logement = null;
      if (e.logement) {
        const from = e.hire_date && dateStr(e.hire_date) > iso(first) ? dateStr(e.hire_date) : iso(first);
        const to = e.contract_end_date && dateStr(e.contract_end_date) < iso(last) ? dateStr(e.contract_end_date) : iso(last);
        const days = from <= to ? Math.round((D(to) - D(from)) / 86400000) + 1 : 0;
        if (days > 0) {
          const hours = parseFloat(e.contract_hours) || 35;
          const monthlyPay = e.salaire_horaire ? parseFloat(e.salaire_horaire) * hours * 52 / 12
            : e.coefficient ? (base + (Math.max(100, e.coefficient) - 100) * point) * hours / 35 : 0;
          const forfait = logementForfait(logementCfg, monthlyPay, e.logement_pieces);
          const weeks = Math.ceil(days / 7);
          const montant = days >= daysInMonth ? forfait : Math.min(forfait, weeks * forfait / 4);
          logement = { jours: days, semaines: days >= daysInMonth ? null : weeks, forfait_mensuel: forfait, montant: Math.round(montant * 100) / 100, pieces: e.logement_pieces || 1 };
        }
      }

      rows.push({
        employee_id: e.id, nom: e.last_name || '', prenom: e.first_name || '', service: e.service,
        contrat: e.contract_type, heures_contrat: contract, temporaire: !!e.is_temp,
        debut_contrat: e.hire_date ? dateStr(e.hire_date) : null, fin_contrat: e.contract_end_date ? dateStr(e.contract_end_date) : null,
        heures_planifiees: h2(planned),
        heures_realisees: workedBy[e.id] !== undefined ? h2(workedBy[e.id]) : null,
        heures_au_dela_contrat: Math.round(weeks.reduce((n, w) => n + w.au_dela, 0) * 100) / 100,
        semaines: weeks,
        dimanches_jours: sunDays.size, dimanches_heures: h2(sunMin),
        feries_jours: ferDays.size, feries_heures: h2(ferMin),
        nuit_heures: h2(night),
        recup_heures: h2(recupMin),
        recup_cumul_periode: h2(recupCumulBy[e.id] || 0),
        retards: latesBy[e.id] || 0,
        modulation_cumul: modBy[e.id] !== undefined ? Math.round(modBy[e.id] * 100) / 100 : null,
        avantage_logement: logement ? logement.montant : null,
        logement,
      });
    }
    res.json({ month, du: iso(first), au: iso(last), rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.holidays = holidays;
module.exports.shiftMinutes = shiftMinutes;
