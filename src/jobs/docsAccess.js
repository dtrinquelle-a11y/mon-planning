const { pool } = require('../db');
const { sendDocsAccessEnding, sendDocsAccessClosed } = require('../email');

// Le salarie consulte ses documents jusqu'a 3 mois apres la fin de son contrat (regle appliquee en base).
// Cette tache previent par email : 7 jours avant la fermeture, puis le lendemain de la fermeture.
// Chaque email n'est envoye qu'une fois par date de fin de contrat (colonnes docs_*_sent_for).
// Fenetre de 7 jours apres chaque echeance : rattrape un serveur arrete, sans relancer d'anciens contrats.
async function checkDocsAccess() {
  // Fonction SQL reservee au backend (le role planning_app n'a pas d'acces direct a la table documents)
  const { rows } = await pool.query('SELECT * FROM public.docs_access_candidates()');

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
