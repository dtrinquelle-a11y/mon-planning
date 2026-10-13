const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { managerOnly, requirePerm } = require('../auth');
const { sendDocsToSign } = require('../email');
const { notifyEmployees } = require('../push');

// POST /api/mandatory-docs/remind  body: { doc_id? }
// Email aux salaries actifs qui n'ont pas (ou plus) de signature valide : un document precis, ou tous si doc_id absent.
// Signature valide = version actuelle du document, et de moins d'un an pour les documents annuels.
router.post('/remind', managerOnly, requirePerm('documents'), async (req, res) => {
  const docId = req.body.doc_id || null;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.email, array_agg(d.title ORDER BY d.sort_order, d.created_at) AS titles
         FROM employees e
         CROSS JOIN mandatory_docs d
        WHERE e.is_active AND NOT COALESCE(e.is_temp, false)
          AND (e.contract_end_date IS NULL OR e.contract_end_date >= (now() AT TIME ZONE 'Europe/Paris')::date)
          AND d.is_active AND d.requires_signature AND ($1::uuid IS NULL OR d.id = $1::uuid)
          AND NOT EXISTS (
            SELECT 1 FROM mandatory_doc_signatures s
             WHERE s.doc_id = d.id AND s.employee_id = e.id AND s.version = d.version
               AND (d.renewal = 'embauche' OR s.signed_at > now() - interval '1 year'))
        GROUP BY e.id`,
      [docId]
    );
    let sent = 0, noEmail = 0;
    for (const e of rows) {
      notifyEmployees([e.id], { title: e.titles.length > 1 ? e.titles.length + ' documents à signer' : 'Document à signer', body: e.titles.join(', '), tag: 'signer' });
      if (!e.email || e.email.endsWith('@temp.fr')) { noEmail++; continue; }
      if (await sendDocsToSign({ to: e.email, employeeName: e.first_name + ' ' + e.last_name, titles: e.titles })) sent++;
    }
    res.json({ sent, no_email: noEmail, pending: rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
