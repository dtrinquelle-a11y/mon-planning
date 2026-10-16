const express = require('express');
const router = express.Router();
const { pool, TODAY_SQL } = require('../db');
const { managerOnly, isEmployeeScoped, requirePerm, userHasPerm } = require('../auth');
const { sendAccessLink, sendCautionLink } = require('../email');

// POST /api/employees/:id/caution-email -> envoie au salarie loge le lien de paiement de la caution
// (Parametrage > Logement). Refuse si le salarie n'est pas loge, si la caution est recue ou sans lien configure.
router.post('/:id/caution-email', managerOnly, async (req, res) => {
  try {
    if (!(await userHasPerm(req.user, 'dossiers_rh')) && !(await userHasPerm(req.user, 'contrats'))) {
      return res.status(403).json({ error: 'Droit insuffisant pour cette action (dossiers_rh ou contrats)' });
    }
    const [{ rows }, { rows: cfg }] = await Promise.all([
      pool.query('SELECT first_name, email, logement, caution_recue_at FROM employees WHERE id = $1', [req.params.id]),
      pool.query("SELECT value FROM app_settings WHERE key = 'logement'"),
    ]);
    const e = rows[0], c = (cfg[0] || {}).value || {};
    if (!e) return res.status(404).json({ error: 'Salarie introuvable' });
    if (!e.logement) return res.status(400).json({ error: "Ce salarie n'est pas loge" });
    if (e.caution_recue_at) return res.status(400).json({ error: 'La caution est deja recue' });
    if (!/^https:\/\//.test(c.caution_lien || '')) return res.status(400).json({ error: 'Aucun lien de paiement : Parametrage > Logement' });
    if (!e.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email) || e.email.endsWith('@temp.fr')) return res.status(400).json({ error: "Pas d'adresse email valide sur la fiche" });
    const sent = await sendCautionLink({ to: e.email, firstName: e.first_name, amount: String(c.caution_montant || '').replace('.', ','), url: c.caution_lien, note: c.caution_texte });
    if (!sent) return res.status(502).json({ error: "L'email n'a pas pu etre envoye" });
    const { rows: upd } = await pool.query('UPDATE employees SET caution_lien_envoye_at = now() WHERE id = $1 RETURNING caution_lien_envoye_at', [req.params.id]);
    res.json({ sent: true, at: upd[0].caution_lien_envoye_at, to: e.email });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/employees/:id/access-link-email  body: { email, url }
// Envoie par email le lien de premier acces genere dans Dossiers RH
router.post('/:id/access-link-email', managerOnly, requirePerm('dossiers_rh'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const url = String(req.body.url || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Adresse email invalide' });
  // Seul un lien d'acces de l'application est accepte (pas de lien arbitraire envoye depuis notre domaine)
  if (!/^https:\/\/[a-z0-9.-]+\/onboarding\?acces=[0-9a-f]{48}$/.test(url)) return res.status(400).json({ error: 'Lien invalide' });
  const allowed = [process.env.FRONTEND_URL, ...(process.env.CORS_ORIGIN || '').split(',')].filter(Boolean).map(o => o.trim().replace(/\/$/, ''));
  if (allowed.length && !allowed.includes(new URL(url).origin)) return res.status(400).json({ error: 'Lien invalide' });
  try {
    const { rows } = await pool.query('SELECT first_name FROM employees WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Salarie introuvable' });
    const sent = await sendAccessLink({ to: email, firstName: rows[0].first_name, url });
    if (!sent) return res.status(502).json({ error: "L'email n'a pas pu etre envoye" });
    res.json({ sent: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// GET /api/employees (?archived=1 pour inclure les salaries archives)
router.get('/', managerOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.role, e.email,
              e.contract_hours, e.contract_type, e.hire_date,
              e.is_active, e.service, e.services_secondaires,
              e.phone, e.address, e.birth_date, e.onboarding_completed,
              e.sort_order, e.is_temp, e.archived_at,
              COALESCE(m.worked_hours, 0) AS heures_travaillees,
              CASE
                WHEN COALESCE(m.worked_hours, 0) > COALESCE(m.threshold_25, 1790) THEN 'majoration_50'
                WHEN COALESCE(m.worked_hours, 0) > COALESCE(m.legal_threshold, 1607) THEN 'majoration_25'
                ELSE 'normal'
              END AS statut_modulation
       FROM employees e
       LEFT JOIN modulation_counter m ON m.employee_id = e.id
         AND m.period_start <= ${TODAY_SQL} AND m.period_end >= ${TODAY_SQL}
       -- Salaries archives (partis) : exclus, sauf ?archived=1
       WHERE e.archived_at IS NULL OR $1::boolean
       ORDER BY e.last_name`,
      [req.query.archived === '1']
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  if (isEmployeeScoped(req) && req.params.id !== req.user.employeeId) return res.status(403).json({ error: 'Acces refuse' });
  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE id = $1',
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/employees
router.post('/', managerOnly, async (req, res) => {
  const { first_name, last_name, role, email, contract_hours, contract_type, service } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO employees (first_name, last_name, role, email, contract_hours, contract_type, service)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [first_name, last_name, role, email, contract_hours, contract_type, service]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/employees/:id
router.patch('/:id', managerOnly, async (req, res) => {
  const allowed = ['first_name', 'last_name', 'role', 'email', 'contract_hours',
                   'contract_type', 'service', 'services_secondaires', 'is_active',
                   'phone', 'address', 'birth_date', 'sort_order'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ valide' });
  const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
  try {
    const result = await pool.query(
      `UPDATE employees SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
      [...updates.map(k => req.body[k]), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Introuvable' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
