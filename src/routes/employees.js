const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/employees
// Liste tous les salariés actifs
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.id, e.first_name, e.last_name, e.role,
        e.email, e.phone, e.contract_hours, e.contract_type,
        e.hire_date, e.is_active, e.service,
        ROUND(m.worked_hours, 2) AS heures_travaillees,
        CASE
          WHEN m.worked_hours > m.threshold_25 THEN 'majoration_50'
          WHEN m.worked_hours > m.legal_threshold THEN 'majoration_25'
          ELSE 'normal'
        END AS statut_modulation
      FROM employees e
      LEFT JOIN modulation_counter m
        ON m.employee_id = e.id
        AND m.period_start <= CURRENT_DATE
        AND m.period_end >= CURRENT_DATE
      WHERE e.is_active = true
      ORDER BY e.last_name
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/employees/:id
// Un salarié avec tout son historique de modulation
router.get('/:id', async (req, res) => {
  try {
    const emp = await pool.query(
      'SELECT * FROM employees WHERE id = $1',
      [req.params.id]
    );
    if (!emp.rows[0]) {
      return res.status(404).json({ error: 'Salarié introuvable' });
    }

    const modulation = await pool.query(`
      SELECT
        ROUND(worked_hours, 2) AS heures_travaillees,
        ROUND(planned_hours, 2) AS heures_planifiees,
        legal_threshold AS seuil_legal,
        threshold_25 AS seuil_majoration_25,
        ROUND(legal_threshold - worked_hours, 2) AS heures_restantes,
        period_start, period_end,
        CASE
          WHEN worked_hours > threshold_25 THEN 'majoration_50'
          WHEN worked_hours > legal_threshold THEN 'majoration_25'
          ELSE 'normal'
        END AS statut
      FROM modulation_counter
      WHERE employee_id = $1
      ORDER BY period_start DESC
    `, [req.params.id]);

    res.json({
      ...emp.rows[0],
      modulation: modulation.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees
// Créer un nouveau salarié + initialise son compteur de modulation
router.post('/', async (req, res) => {
  const {
    first_name, last_name, role, email,
    phone, contract_hours, contract_type, hire_date
  } = req.body;

  if (!first_name || !last_name || !role || !email) {
    return res.status(400).json({
      error: 'first_name, last_name, role et email sont requis'
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Crée le salarié
    const emp = await client.query(`
      INSERT INTO employees
        (first_name, last_name, role, email, phone,
         contract_hours, contract_type, hire_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *
    `, [
      first_name, last_name, role, email,
      phone || null,
      contract_hours || 35,
      contract_type || 'CDI',
      hire_date || null
    ]);

    // Initialise le compteur de modulation pour la période en cours
    // Période CC HPA : 1er novembre → 31 octobre
    const now = new Date();
    const year = now.getMonth() >= 10 ? now.getFullYear() : now.getFullYear() - 1;
    const periodStart = `${year}-11-01`;
    const periodEnd = `${year + 1}-10-31`;

    await client.query(`
      INSERT INTO modulation_counter
        (employee_id, period_start, period_end)
      VALUES ($1, $2, $3)
    `, [emp.rows[0].id, periodStart, periodEnd]);

    await client.query('COMMIT');
    res.status(201).json(emp.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/employees/:id
// Modifier un salarié (rôle, heures contrat, téléphone...)
router.patch('/:id', async (req, res) => {
  const allowed = ['first_name', 'last_name', 'role', 'email',
                   'phone', 'contract_hours', 'contract_type', 'is_active'];
  const updates = Object.keys(req.body)
    .filter(k => allowed.includes(k));

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Aucun champ valide à mettre à jour' });
  }

  const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = updates.map(k => req.body[k]);

  try {
    const result = await pool.query(
      `UPDATE employees SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
      [...values, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Salarié introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
