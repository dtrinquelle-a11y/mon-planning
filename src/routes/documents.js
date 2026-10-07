const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly } = require('../auth');
const { sendDocumentAvailable } = require('../email');

const TYPE_LABELS = {
  bulletin_paie: 'Bulletin de paie', contrat: 'Contrat', avenant: 'Avenant',
  attestation: 'Attestation', certificat: 'Certificat', autre: 'Document',
};
const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

// POST /api/documents/notify  body: { employee_id, type, title, periode }
// Previent le salarie par email qu'un document vient d'etre depose (appele par l'ecran Documents)
router.post('/notify', managerOnly, async (req, res) => {
  const { employee_id, type, title, periode } = req.body;
  if (!employee_id) return res.status(400).json({ error: 'employee_id requis' });
  try {
    const { rows } = await pool.query('SELECT first_name, last_name, email FROM employees WHERE id = $1', [employee_id]);
    const emp = rows[0];
    if (!emp) return res.status(404).json({ error: 'Salarie introuvable' });
    if (!emp.email || emp.email.endsWith('@temp.fr')) return res.json({ sent: false, reason: 'pas d\'email' });

    const m = /^(\d{4})-(\d{2})$/.exec(periode || '');
    const docLabel = type === 'bulletin_paie' && m
      ? 'Bulletin de paie de ' + MOIS[parseInt(m[2], 10) - 1] + ' ' + m[1]
      : (title || TYPE_LABELS[type] || 'Document');

    const sent = await sendDocumentAvailable({ to: emp.email, employeeName: emp.first_name + ' ' + emp.last_name, docLabel });
    res.json({ sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
