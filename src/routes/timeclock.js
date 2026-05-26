const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { sendGeoAlert } = require('../email');

// POST /api/timeclock/scan
router.post('/scan', async (req, res) => {
  const { employee_id, action, latitude, longitude, geo_valid } = req.body;
  if (!employee_id || !action) return res.status(400).json({ error: 'employee_id et action sont requis' });
  if (!['in','out'].includes(action)) return res.status(400).json({ error: 'action doit etre in ou out' });

  try {
    const result = await pool.query(
      'SELECT process_timeclock_scan($1, $2) AS resultat',
      [employee_id, action]
    );
    const data = result.rows[0].resultat;

    // Sauvegarde geo si fournie
    if (latitude && longitude) {
      await pool.query(
        'UPDATE timeclock SET latitude=$1, longitude=$2, geo_valid=$3 WHERE id=$4',
        [latitude, longitude, geo_valid || false, data.scan_id]
      );
    }

    // Alerte geo si hors perimetre
    if (latitude && geo_valid === false) {
      const emp = await pool.query('SELECT first_name, last_name FROM employees WHERE id=$1', [employee_id]);
      const manager = await pool.query(`
        SELECT e.email FROM employees e
        JOIN user_profiles p ON p.employee_id = e.id
        WHERE p.role IN ('admin','manager') LIMIT 1
      `);
      if (manager.rows[0]?.email && emp.rows[0]) {
        const dist = req.body.distance || '?';
        const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        sendGeoAlert({
          managerEmail: manager.rows[0].email,
          employeeName: emp.rows[0].first_name + ' ' + emp.rows[0].last_name,
          action,
          distance: dist,
          time,
        });
      }
    }

    res.status(201).json({
      success: true,
      ...data,
      message: action === 'in'
        ? data.is_late ? 'Arrivee enregistree — retard de ' + data.late_minutes + ' min' : 'Arrivee enregistree'
        : 'Depart enregistre — ' + (data.worked_minutes / 60).toFixed(2) + 'h travaillees'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/timeclock/today
router.get('/today', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.id, t.action, t.scanned_at, t.is_late, t.late_minutes,
             t.geo_valid, t.latitude, t.longitude, t.employee_id,
             e.first_name, e.last_name, e.role
      FROM timeclock t
      JOIN employees e ON t.employee_id = e.id
      WHERE t.scanned_at::date = CURRENT_DATE
      ORDER BY t.scanned_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/timeclock/presence
router.get('/presence', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (t.employee_id)
        e.id, e.first_name, e.last_name, e.role,
        t.action AS dernier_pointage, t.scanned_at,
        CASE WHEN t.action = 'in' THEN true ELSE false END AS en_poste
      FROM timeclock t
      JOIN employees e ON t.employee_id = e.id
      WHERE t.scanned_at::date = CURRENT_DATE
      ORDER BY t.employee_id, t.scanned_at DESC
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/timeclock/modulation/:employee_id
router.get('/modulation/:employee_id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.first_name, e.last_name,
        ROUND(m.worked_hours, 2) AS heures_travaillees,
        ROUND(m.planned_hours, 2) AS heures_planifiees,
        m.legal_threshold AS seuil_legal,
        m.threshold_25 AS seuil_majoration_25,
        ROUND(m.legal_threshold - m.worked_hours, 2) AS heures_restantes,
        CASE
          WHEN m.worked_hours > m.threshold_25 THEN 'majoration_50'
          WHEN m.worked_hours > m.legal_threshold THEN 'majoration_25'
          ELSE 'normal'
        END AS statut,
        m.period_start, m.period_end
      FROM modulation_counter m
      JOIN employees e ON m.employee_id = e.id
      WHERE m.employee_id = $1
        AND m.period_start <= CURRENT_DATE
        AND m.period_end >= CURRENT_DATE
    `, [req.params.employee_id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Compteur introuvable' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/timeclock/modulation
router.get('/modulation', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.id, e.first_name, e.last_name, e.role,
        ROUND(m.worked_hours, 2) AS heures_travaillees,
        m.legal_threshold AS seuil_legal,
        ROUND(m.legal_threshold - m.worked_hours, 2) AS heures_restantes,
        CASE
          WHEN m.worked_hours > m.threshold_25 THEN 'majoration_50'
          WHEN m.worked_hours > m.legal_threshold THEN 'majoration_25'
          ELSE 'normal'
        END AS statut
      FROM modulation_counter m
      JOIN employees e ON m.employee_id = e.id
      WHERE m.period_start <= CURRENT_DATE AND m.period_end >= CURRENT_DATE
      ORDER BY e.last_name
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
