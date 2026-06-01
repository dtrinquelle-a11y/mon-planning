const express = require('express');
const router = express.Router();
const { pool } = require('../db');
// GET /api/employees
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.role, e.email,
              e.contract_hours, e.contract_type, e.hire_date,
              e.is_active, e.service, e.services_secondaires,
              e.phone, e.address, e.birth_date, e.onboarding_completed,
              COALESCE(m.worked_hours, 0) AS heures_travaillees,
              CASE
                WHEN COALESCE(m.worked_hours, 0) > COALESCE(m.threshold_25, 1790) THEN 'majoration_50'
                WHEN COALESCE(m.worked_hours, 0) > COALESCE(m.legal_threshold, 1607) THEN 'majoration_25'
                ELSE 'normal'
              END AS statut_modulation
       FROM employees e
       LEFT JOIN modulation_counter m ON m.employee_id = e.id
         AND m.period_start <= CURRENT_DATE AND m.period_end >= CURRENT_DATE
       ORDER BY e.last_name`
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
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
router.post('/', async (req, res) => {
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
router.patch('/:id', async (req, res) => {
  const allowed = ['first_name', 'last_name', 'role', 'email', 'contract_hours',
                   'contract_type', 'service', 'services_secondaires', 'is_active',
                   'phone', 'address', 'birth_date'];
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
