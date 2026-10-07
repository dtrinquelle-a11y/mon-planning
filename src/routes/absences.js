const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendAbsenceRequested, sendAbsenceDecided } = require('../email');

const TYPE_LABELS = {
  conge_paye: 'Conges payes', repos: 'Repos / recuperation', indisponibilite: 'Indisponibilite',
  maladie: 'Arret maladie', sans_solde: 'Conge sans solde', autre: 'Autre absence',
};

// "2026-10-20" -> "20/10/2026"
const fr = d => { const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10); return s.split('-').reverse().join('/'); };
const periodLabel = a => a.start_date === a.end_date ? 'Le ' + fr(a.start_date) : 'Du ' + fr(a.start_date) + ' au ' + fr(a.end_date);

// POST /api/absences/notify  body: { request_id, event: 'created' | 'decided' }
// Les demandes sont creees/traitees dans la base par l'application ; cette route envoie seulement les emails.
router.post('/notify', async (req, res) => {
  const { request_id, event } = req.body;
  if (!request_id || !['created', 'decided'].includes(event)) return res.status(400).json({ error: 'Parametres invalides' });
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
      const results = await Promise.all((a.manager_emails || []).map(to =>
        sendAbsenceRequested({ to, employeeName, typeLabel, periodLabel: periodLabel(a), comment: a.comment })));
      return res.json({ sent: results.filter(Boolean).length });
    }

    // event === 'decided' : reserve aux managers
    if (req.user && !req.user.isManager) return res.status(403).json({ error: 'Reserve aux managers' });
    if (!['acceptee', 'refusee'].includes(a.status) || !a.email || a.email.endsWith('@temp.fr')) return res.json({ sent: 0 });
    const ok = await sendAbsenceDecided({ to: a.email, employeeName, typeLabel, periodLabel: periodLabel(a), accepted: a.status === 'acceptee', managerComment: a.manager_comment });
    res.json({ sent: ok ? 1 : 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
