const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// Table generique de reglages cle/valeur (utilisee pour les toggles temporaires, ex: mode test pointeuse)
let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
                    value TEXT,
                          updated_at TIMESTAMP DEFAULT NOW()
                              )
                                `);
                                  tableReady = true;
                                  }

                                  // GET /api/settings/:key
                                  router.get('/:key', async (req, res) => {
                                    try {
                                        await ensureTable();
                                            const result = await pool.query('SELECT value FROM app_settings WHERE key = $1', [req.params.key]);
                                                res.json({ key: req.params.key, value: result.rows[0] ? result.rows[0].value : null });
                                                  } catch (err) {
                                                      res.status(500).json({ error: err.message });
                                                        }
                                                        });

                                                        // PUT /api/settings/:key  body: { value: 'true' | 'false' }
                                                        router.put('/:key', async (req, res) => {
                                                          try {
                                                              await ensureTable();
                                                                  const { value } = req.body;
                                                                      await pool.query(
                                                                            `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
                                                                                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
                                                                                         [req.params.key, String(value)]
                                                                                             );
                                                                                                 res.json({ ok: true, key: req.params.key, value: String(value) });
                                                                                                   } catch (err) {
                                                                                                       res.status(500).json({ error: err.message });
                                                                                                         }
                                                                                                         });
                                                                                                         
                                                                                                         module.exports = router;
