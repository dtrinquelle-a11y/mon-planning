require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, supabase } = require('./db');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 10mb pour les photos base64

// Routes
const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const timeclockRouter = require('./routes/timeclock');

app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/timeclock', timeclockRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// GET /api/settings/:key
app.get('/api/settings', async (req, res) => {
  try {
    console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'OK' : 'MANQUANT');
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) throw error;
    const map = {};
    (data || []).forEach(s => { map[s.key] = s.value; });
    res.json(map);
  } catch (err) { 
    console.error('Erreur settings:', err.message);
    res.status(500).json({ error: err.message }); 
  }
});

// GET /api/settings
app.get('/api/settings', async (req, res) => {
  try {
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) throw error;
    const map = {};
    (data || []).forEach(s => { map[s.key] = s.value; });
    res.json(map);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/settings/:key
app.patch('/api/settings/:key', async (req, res) => {
  try {
    const { error } = await supabase.from('app_settings')
      .update({ value: req.body, updated_at: new Date().toISOString() })
      .eq('key', req.params.key);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ping DB toutes les 9 minutes pour éviter mise en pause Supabase
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[Ping] DB ok -', new Date().toLocaleTimeString('fr-FR'));
  } catch (e) {
    console.error('[Ping] DB error:', e.message);
  }
}, 9 * 60 * 1000);

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Serveur Planning HPA sur port ' + PORT);
  pool.query('SELECT 1').then(() => console.log('[Ping] DB connectée')).catch(e => console.error('[Ping] Erreur init:', e.message));
});
