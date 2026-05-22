const express = require('express');
const router = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: 'Paramètre week requis' });
  try {
    const result = await pool.query(`
      SELECT s.*, e.id AS employee_id, e.first_name, e.last_name, e.role,
        ROUND(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600 - s.break_minutes / 60.0, 2) AS heures_nettes
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.work_date >= $1::date
        AND s.work_date < $1::date + INTERVAL '7 days'
      ORDER BY s.work_date, s.start_time
    `, [week]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { employee_id, work_date, start_time, end_time, shift_type, break_minutes, note } = req.body;
  if (!employee_id || !work_date || !start_time || !end_time || !shift_type)
    return res.status(400).json({ error: 'Champs requis manquants' });
  try {
    const result = await pool.query(`
      INSERT INTO schedules (employee_id, work_date, start_time, end_time, shift_type, break_minutes, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [employee_id, work_date, start_time, end_time, shift_type, break_minutes || 0, note || null]);
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/:id', async (req, res) => {
  const allowed = ['start_time', 'end_time', 'shift_type', 'break_minutes', 'note', 'work_date'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ valide' });
  const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
  try {
    const result = await pool.query(
      `UPDATE schedules SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
      [...updates.map(k => req.body[k]), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Créneau introuvable' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/publish', async (req, res) => {
  const { week } = req.body;
  if (!week) return res.status(400).json({ error: 'Paramètre week requis' });
  try {
    const result = await pool.query(`
      UPDATE schedules SET is_published = true
      WHERE work_date >= $1::date AND work_date < $1::date + INTERVAL '7 days' AND is_published = false
      RETURNING id
    `, [week]);
    res.json({ success: true, published: result.rowCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Créneau introuvable' });
    res.json({ success: true, deleted_id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
