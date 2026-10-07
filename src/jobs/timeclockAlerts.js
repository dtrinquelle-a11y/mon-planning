const { pool } = require('../db');
const { sendTimeclockMissing } = require('../email');

// Alerte "oubli de pointage" : activee depuis la page Realise (reglage app_settings "alertes_pointage" :
// { enabled: true|false, delay_min: 15|30|60 }). Toutes les 5 minutes, les creneaux publies du jour sans
// arrivee (ou sans depart) au-dela du delai declenchent un email aux managers, une seule fois par creneau.
async function checkTimeclockAlerts() {
  const { rows: cfg } = await pool.query("SELECT value FROM app_settings WHERE key = 'alertes_pointage'");
  const conf = cfg[0] && cfg[0].value;
  if (!conf || !conf.enabled) return;
  const delay = [15, 30, 60].includes(Number(conf.delay_min)) ? Number(conf.delay_min) : 30;

  const { rows } = await pool.query('SELECT * FROM public.pending_timeclock_alerts($1)', [delay]);
  for (const a of rows) {
    const d = a.work_date instanceof Date ? a.work_date : new Date(a.work_date);
    const dateLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    const shiftLabel = String(a.start_time).slice(0, 5) + ' - ' + String(a.end_time).slice(0, 5);
    const recipients = a.manager_emails || [];
    const results = await Promise.all(recipients.map(to =>
      sendTimeclockMissing({ to, employeeName: a.employee_name, kind: a.kind, dateLabel, shiftLabel })));
    // Note l'alerte comme envoyee des qu'au moins un manager l'a recue (evite les doublons)
    if (results.some(Boolean)) await pool.query('SELECT public.mark_timeclock_alert($1, $2)', [a.schedule_id, a.kind]);
  }
}

function startTimeclockAlertsJob() {
  const run = () => checkTimeclockAlerts().catch(err => console.error('[Pointage] Erreur alertes oubli :', err.message));
  setTimeout(run, 90 * 1000);
  setInterval(run, 5 * 60 * 1000);
}

module.exports = { startTimeclockAlertsJob, checkTimeclockAlerts };
