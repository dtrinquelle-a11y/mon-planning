const express = require('express');
const router = express.Router();
const { pool, TZ } = require('../db');
const { sendPlanningPublished, sendShiftModified } = require('../email');

// pg renvoie les colonnes DATE en Date a minuit heure locale : on relit les composantes locales
function formatDate(d) {
  if (!(d instanceof Date)) return String(d);
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// GET /api/schedules?week=2026-05-18
router.get('/', async (req, res) => {
  const { week } = req.query;
  if (!week) return res.status(400).json({ error: 'Parametre week requis' });
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

// GET /api/schedules/monthly-summary?month=2026-06
router.get('/monthly-summary', async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const monthStart = month + '-01';
  try {
    // Heures planifiées par salarié ce mois
    const planned = await pool.query(`
      SELECT 
        s.employee_id,
        ROUND(SUM(EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600 - s.break_minutes / 60.0)::numeric, 2) AS heures_planifiees
      FROM schedules s
      WHERE s.work_date >= $1::date
        AND s.work_date < $1::date + INTERVAL '1 month'
      GROUP BY s.employee_id
    `, [monthStart]);

    // Heures réalisées par salarié ce mois : chaque 'in' est apparié au pointage suivant s'il s'agit d'un 'out'
    const worked = await pool.query(`
      WITH scans AS (
        SELECT employee_id, action, scanned_at,
          scanned_at AT TIME ZONE '${TZ}' AS local_at,
          LEAD(action) OVER w AS next_action,
          LEAD(scanned_at) OVER w AS next_at
        FROM timeclock
        WHERE scanned_at AT TIME ZONE '${TZ}' >= $1::date - INTERVAL '1 day'
          AND scanned_at AT TIME ZONE '${TZ}' < $1::date + INTERVAL '1 month 1 day'
        WINDOW w AS (PARTITION BY employee_id ORDER BY scanned_at)
      )
      SELECT
        employee_id,
        ROUND(SUM(EXTRACT(EPOCH FROM (next_at - scanned_at)) / 3600)::numeric, 2) AS heures_realisees
      FROM scans
      WHERE action = 'in'
        AND next_action = 'out'
        AND next_at - scanned_at < INTERVAL '24 hours'
        AND local_at >= $1::date
        AND local_at < $1::date + INTERVAL '1 month'
      GROUP BY employee_id
    `, [monthStart]);

    // Fusionner les deux résultats
    const summary = {};
    planned.rows.forEach(r => {
      summary[r.employee_id] = { heures_planifiees: parseFloat(r.heures_planifiees), heures_realisees: 0 };
    });
    worked.rows.forEach(r => {
      if (summary[r.employee_id]) {
        summary[r.employee_id].heures_realisees = parseFloat(r.heures_realisees);
      } else {
        summary[r.employee_id] = { heures_planifiees: 0, heures_realisees: parseFloat(r.heures_realisees) };
      }
    });

    res.json(summary);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/schedules
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

// PATCH /api/schedules/:id
router.patch('/:id', async (req, res) => {
  const allowed = ['start_time', 'end_time', 'shift_type', 'break_minutes', 'note', 'work_date', 'employee_id'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));
  if (!updates.length) return res.status(400).json({ error: 'Aucun champ valide' });
  const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
  try {
    const old = await pool.query(
      'SELECT s.*, e.email, e.first_name, e.last_name FROM schedules s JOIN employees e ON s.employee_id = e.id WHERE s.id = $1',
      [req.params.id]
    );
    const result = await pool.query(
      `UPDATE schedules SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
      [...updates.map(k => req.body[k]), req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Creneau introuvable' });
    const before = old.rows[0];
    const after = result.rows[0];
    const timeChanged = before && (before.start_time !== after.start_time || before.end_time !== after.end_time);
    if (timeChanged && before.is_published && before.email) {
      sendShiftModified({
        to: before.email,
        employeeName: before.first_name + ' ' + before.last_name,
        date: formatDate(after.work_date),
        oldStart: before.start_time,
        oldEnd: before.end_time,
        newStart: after.start_time,
        newEnd: after.end_time,
        note: after.note,
      });
    }
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/schedules/publish
router.post('/publish', async (req, res) => {
  const { week } = req.body;
  if (!week) return res.status(400).json({ error: 'Parametre week requis' });
  try {
    const toNotify = await pool.query(`
      SELECT s.*, e.email, e.first_name, e.last_name
      FROM schedules s JOIN employees e ON s.employee_id = e.id
      WHERE s.work_date >= $1::date AND s.work_date < $1::date + INTERVAL '7 days'
        AND s.is_published = false AND e.email IS NOT NULL
    `, [week]);
    const result = await pool.query(`
      UPDATE schedules SET is_published = true
      WHERE work_date >= $1::date AND work_date < $1::date + INTERVAL '7 days'
      AND is_published = false RETURNING id
    `, [week]);
    const byEmp = {};
    toNotify.rows.forEach(s => {
      if (!byEmp[s.employee_id]) byEmp[s.employee_id] = { email: s.email, name: s.first_name + ' ' + s.last_name, count: 0 };
      byEmp[s.employee_id].count++;
    });
    Object.values(byEmp).forEach(emp => {
      sendPlanningPublished({ to: emp.email, employeeName: emp.name, weekStart: week, shiftsCount: emp.count });
    });
    res.json({ success: true, published: result.rowCount, notified: Object.keys(byEmp).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/schedules/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM schedules WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Creneau introuvable' });
    res.json({ success: true, deleted_id: req.params.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
