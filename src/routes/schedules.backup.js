const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/schedules?week=2026-05-18
// Récupère tous les créneaux d'une semaine (lundi au dimanche)
router.get('/', async (req, res) => {
  const { week } = req.query;
  if (!week) {
    return res.status(400).json({ error: 'Paramètre week requis (ex: 2026-05-18)' });
  }

  try {
    const result = await pool.query(`
      SELECT
        s.id, s.work_date, s.start_time, s.end_time,
        s.shift_type, s.break_minutes, s.is_published, s.note,
        e.id AS employee_id, e.first_name, e.last_name, e.role,
        ROUND(
          EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600
          - s.break_minutes / 60.0
        , 2) AS heures_nettes
      FROM schedules s
      JOIN employees e ON s.employee_id = e.id
      WHERE s.work_date >= $1::date
        AND s.work_date < $1::date + INTERVAL '7 days'
      ORDER BY s.work_date, s.start_time, e.last_name
    `, [week]);

    // Regroupe par employé pour le frontend
    const byEmployee = {};
    result.rows.forEach(row => {
      if (!byEmployee[row.employee_id]) {
        byEmployee[row.employee_id] = {
          employee_id: row.employee_id,
          first_name: row.first_name,
          last_name: row.last_name,
          role: row.role,
          shifts: []
        };
      }
      byEmployee[row.employee_id].shifts.push({
        id: row.id,
        work_date: row.work_date,
        start_time: row.start_time,
        end_time: row.end_time,
        shift_type: row.shift_type,
        break_minutes: row.break_minutes,
        heures_nettes: row.heures_nettes,
        is_published: row.is_published,
        note: row.note
      });
    });

    res.json({
      week_start: week,
      employees: Object.values(byEmployee)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules
// Créer un créneau
router.post('/', async (req, res) => {
  const {
    employee_id, work_date, start_time,
    end_time, shift_type, break_minutes, note
  } = req.body;

  if (!employee_id || !work_date || !start_time || !end_time || !shift_type) {
    return res.status(400).json({
      error: 'employee_id, work_date, start_time, end_time et shift_type sont requis'
    });
  }

  try {
    // Vérifie les chevauchements
    const overlap = await pool.query(`
      SELECT id FROM schedules
      WHERE employee_id = $1
        AND work_date = $2
        AND (
          (start_time < $4 AND end_time > $3)
        )
    `, [employee_id, work_date, start_time, end_time]);

    if (overlap.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflit : ce salarié a déjà un créneau qui chevauche cette plage horaire'
      });
    }

    // Vérifie la durée max hebdomadaire CC HPA (48h)
    const weekTotal = await pool.query(`
      SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (end_time - start_time)) / 3600 - break_minutes / 60.0
      ), 0) AS total_heures
      FROM schedules
      WHERE employee_id = $1
        AND work_date >= date_trunc('week', $2::date)
        AND work_date < date_trunc('week', $2::date) + INTERVAL '7 days'
    `, [employee_id, work_date]);

    const newShiftHours = (
      new Date(`1970-01-01T${end_time}`) - new Date(`1970-01-01T${start_time}`)
    ) / 3600000 - (break_minutes || 0) / 60;

    if (parseFloat(weekTotal.rows[0].total_heures) + newShiftHours > 48) {
      return res.status(422).json({
        error: `Dépassement CC HPA : ce créneau porterait la semaine à ${
          (parseFloat(weekTotal.rows[0].total_heures) + newShiftHours).toFixed(1)
        }h (max 48h)`
      });
    }

    const result = await pool.query(`
      INSERT INTO schedules
        (employee_id, work_date, start_time, end_time,
         shift_type, break_minutes, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `, [
      employee_id, work_date, start_time, end_time,
      shift_type, break_minutes || 0, note || null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/schedules/:id
// Modifier un créneau (glisser-déposer)
router.patch('/:id', async (req, res) => {
  const allowed = ['start_time', 'end_time', 'shift_type', 'break_minutes', 'note', 'work_date', 'employee_id'];
  const updates = Object.keys(req.body).filter(k => allowed.includes(k));

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Aucun champ valide' });
  }

  const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const values = updates.map(k => req.body[k]);

  try {
    const result = await pool.query(
      `UPDATE schedules SET ${setClause} WHERE id = $${updates.length + 1} RETURNING *`,
      [...values, req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Créneau introuvable' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/schedules/publish
// Publie tous les créneaux d'une semaine (les rend visibles aux salariés)
router.post('/publish', async (req, res) => {
  const { week } = req.body;
  if (!week) {
    return res.status(400).json({ error: 'Paramètre week requis' });
  }

  try {
    const result = await pool.query(`
      UPDATE schedules
      SET is_published = true
      WHERE work_date >= $1::date
        AND work_date < $1::date + INTERVAL '7 days'
        AND is_published = false
      RETURNING id
    `, [week]);

    res.json({
      success: true,
      published: result.rowCount,
      message: `${result.rowCount} créneau(x) publié(s) — les salariés peuvent maintenant voir leur planning`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/schedules/:id
// Supprimer un créneau
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM schedules WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Créneau introuvable' });
    }
    res.json({ success: true, deleted_id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

