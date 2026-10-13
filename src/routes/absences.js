const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendAbsenceRequested, sendAbsenceDecided, sendAbsenceChanged, sendClosureLeave } = require('../email');
const { managerOnly, requirePerm, userHasPerm } = require('../auth');
const { notifyEmployees, notifyManagers } = require('../push');

const TYPE_LABELS = {
  conge_paye: 'Conges payes', repos: 'Repos / recuperation', indisponibilite: 'Indisponibilite',
  maladie: 'Arret maladie', sans_solde: 'Conge sans solde', autre: 'Autre absence',
};

// "2026-10-20" -> "20/10/2026"
const fr = d => { const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); return s.split('-').reverse().join('/'); };
const periodLabel = a => a.start_date === a.end_date ? 'Le ' + fr(a.start_date) : 'Du ' + fr(a.start_date) + ' au ' + fr(a.end_date);
// Dates demandees par le salarie, si le manager les a changees
const requestedLabel = a => a.original_start_date ? periodLabel({ start_date: a.original_start_date, end_date: a.original_end_date }) : null;

// POST /api/absences/notify  body: { request_id, event: 'created' | 'decided' | 'modified' | 'cancelled' }
// Les demandes sont creees/traitees dans la base par l'application ; cette route envoie seulement les emails.
router.post('/notify', async (req, res) => {
  const { request_id, event } = req.body;
  if (!request_id || !['created', 'decided', 'modified', 'cancelled'].includes(event)) return res.status(400).json({ error: 'Parametres invalides' });
  try {
    const { rows } = await pool.query('SELECT public.absence_notification_data($1) AS d', [request_id]);
    const a = rows[0] && rows[0].d;
    if (!a) return res.status(404).json({ error: 'Demande introuvable' });
    const employeeName = a.first_name + ' ' + a.last_name;
    const typeLabel = TYPE_LABELS[a.type] || 'Absence';

    if (event === 'created') {
      // Le salarie ne peut notifier que pour sa propre demande
      if (req.user && !req.user.isManager && req.user.employeeId !== a.employee_id) return res.status(403).json({ error: 'Acces refuse' });
      if (a.status !== 'en_attente') return res.json({ sent: 0 });
      notifyManagers({ title: "Demande d'absence", body: employeeName + ' : ' + typeLabel.toLowerCase() + ', ' + periodLabel(a).toLowerCase(), tag: 'absence-' + a.id });
      const results = await Promise.all((a.manager_emails || []).map(to =>
        sendAbsenceRequested({ to, employeeName, employeeEmail: a.email && !a.email.endsWith('@temp.fr') ? a.email : null, typeLabel, periodLabel: periodLabel(a), comment: a.comment })));
      return res.json({ sent: results.filter(Boolean).length });
    }

    // Evenements suivants : reserves aux managers
    if (req.user && !req.user.isManager) return res.status(403).json({ error: 'Reserve aux managers' });
    if (!(await userHasPerm(req.user, 'absences'))) return res.status(403).json({ error: 'Droit insuffisant pour traiter les absences' });
    // Notification sur le telephone du salarie (meme sans email)
    const pushTitle = event === 'cancelled' ? 'Absence annulée' : event === 'modified' ? 'Absence modifiée'
      : a.status === 'acceptee' ? 'Absence acceptée' : a.status === 'refusee' ? 'Absence refusée' : null;
    if (pushTitle) notifyEmployees([a.employee_id], { title: pushTitle, body: typeLabel + ' · ' + periodLabel(a).toLowerCase() + (a.manager_comment ? ' · ' + a.manager_comment : ''), tag: 'absence-' + a.id });
    if (!a.email || a.email.endsWith('@temp.fr')) return res.json({ sent: 0 });

    // Absence deja acceptee puis modifiee ou annulee par l'employeur
    if (event === 'modified' || event === 'cancelled') {
      const cancelled = event === 'cancelled';
      if (cancelled ? a.status !== 'annulee' : a.status !== 'acceptee') return res.json({ sent: 0 });
      const ok = await sendAbsenceChanged({ to: a.email, employeeName, typeLabel, periodLabel: periodLabel(a), cancelled, managerComment: a.manager_comment, requestedLabel: requestedLabel(a) });
      return res.json({ sent: ok ? 1 : 0 });
    }

    if (!['acceptee', 'refusee'].includes(a.status) || !a.email || a.email.endsWith('@temp.fr')) return res.json({ sent: 0 });
    const ok = await sendAbsenceDecided({ to: a.email, employeeName, typeLabel, periodLabel: periodLabel(a), accepted: a.status === 'acceptee', managerComment: a.manager_comment, requestedLabel: requestedLabel(a) });
    res.json({ sent: ok ? 1 : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/absences/closure-notify  body: { closure_id }
// Previent chaque salarie des conges poses pour une fermeture de l'entreprise (Parametrage > Conges payes)
router.post('/closure-notify', managerOnly, requirePerm('parametrage'), async (req, res) => {
  const id = req.body.closure_id;
  if (!/^[0-9a-f-]{36}$/i.test(id || '')) return res.status(400).json({ error: 'closure_id requis' });
  try {
    const { rows } = await pool.query(
      `SELECT a.start_date, a.end_date, a.comment, e.first_name, e.last_name, e.email
         FROM absence_requests a JOIN employees e ON e.id = a.employee_id
        WHERE a.closure_id = $1 AND a.status = 'acceptee'`, [id]);
    const ids = await pool.query("SELECT DISTINCT employee_id FROM absence_requests WHERE closure_id = $1 AND status = 'acceptee'", [id]);
    if (rows[0]) notifyEmployees(ids.rows.map(r => r.employee_id), { title: 'Congés payés posés', body: (rows[0].comment || "Fermeture de l'entreprise") + ' · ' + periodLabel(rows[0]).toLowerCase(), tag: 'fermeture-' + id });
    let sent = 0;
    for (const a of rows) {
      if (!a.email || a.email.endsWith('@temp.fr')) continue;
      if (await sendClosureLeave({ to: a.email, employeeName: a.first_name + ' ' + a.last_name, label: a.comment || "Fermeture de l'entreprise", periodLabel: periodLabel(a) })) sent++;
    }
    res.json({ sent, total: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
