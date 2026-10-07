const { pool, TODAY_SQL } = require('../db');
const { sendDocsAccessEnding, sendDocsAccessClosed } = require('../email');

// Le salarie consulte ses documents jusqu'a 3 mois apres la fin de son contrat (regle appliquee en base).
// Cette tache previent par email : 7 jours avant la fermeture, puis le lendemain de la fermeture.
// Chaque email n'est envoye qu'une fois par date de fin de contrat (colonnes docs_*_sent_for).
// Fenetre de 7 jours apres chaque echeance : rattrape un serveur arrete, sans relancer d'anciens contrats.
async function checkDocsAccess() {
  const { rows } = await pool.query(`
    SELECT e.id, e.first_name, e.last_name, e.email, e.contract_end_date,
      (e.contract_end_date + INTERVAL '3 months')::date AS access_end,
      ${TODAY_SQL} AS today,
      e.docs_reminder_sent_for IS DISTINCT FROM e.contract_end_date AS reminder_due,
      e.docs_closed_sent_for IS DISTINCT FROM e.contract_end_date AS closed_due
    FROM employees e
    WHERE e.contract_end_date IS NOT NULL
      AND e.email IS NOT NULL AND e.email NOT LIKE '%@temp.fr'
      AND EXISTS (SELECT 1 FROM documents d WHERE d.employee_id = e.id)
  `);

  for (const emp of rows) {
    const accessEnd = new Date(emp.access_end);
    const today = new Date(emp.today);
    const daysLeft = Math.round((accessEnd - today) / 86400000);
    const name = emp.first_name + ' ' + emp.last_name;

    if (emp.reminder_due && daysLeft >= 0 && daysLeft <= 7) {
      const accessEndLabel = accessEnd.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      if (await sendDocsAccessEnding({ to: emp.email, employeeName: name, accessEndLabel })) {
        await pool.query('UPDATE employees SET docs_reminder_sent_for = contract_end_date WHERE id = $1', [emp.id]);
      }
    } else if (emp.closed_due && daysLeft <= -1 && daysLeft >= -7) {
      if (await sendDocsAccessClosed({ to: emp.email, employeeName: name })) {
        await pool.query('UPDATE employees SET docs_closed_sent_for = contract_end_date WHERE id = $1', [emp.id]);
      }
    }
  }
}

// Verification au demarrage (apres 1 minute) puis toutes les heures
function startDocsAccessJob() {
  const run = () => checkDocsAccess().catch(err => console.error('[Docs] Erreur verification acces documents :', err.message));
  setTimeout(run, 60 * 1000);
  setInterval(run, 60 * 60 * 1000);
}

module.exports = { startDocsAccessJob, checkDocsAccess };
