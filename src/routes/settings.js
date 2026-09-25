const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Reglages cle/valeur (table app_settings, colonne value en jsonb)
async function upsertSetting(key, value) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, JSON.stringify(value)]
  );
}

// GET /api/settings -> { cle: valeur, ... }
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM app_settings');
    const map = {};
    result.rows.forEach(s => { map[s.key] = s.value; });
    res.json(map);
  } catch (err) {
    console.error('Erreur settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/:key
router.get('/:key', async (req, res) => {
  try {
    const result = await pool.query('SELECT value FROM app_settings WHERE key = $1', [req.params.key]);
    res.json({ key: req.params.key, value: result.rows[0] ? result.rows[0].value : null });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/settings/:key  body: la valeur complete (objet JSON)
router.patch('/:key', async (req, res) => {
  try {
    await upsertSetting(req.params.key, req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/settings/:key  body: { value: ... }
router.put('/:key', async (req, res) => {
  try {
    await upsertSetting(req.params.key, req.body.value);
    res.json({ ok: true, key: req.params.key, value: req.body.value });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
