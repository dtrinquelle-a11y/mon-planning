const express = require('express');
const cors = require('cors');
const { pool } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const timeclockRouter = require('./routes/timeclock');

app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/timeclock', timeclockRouter);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

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
  // Premier ping immédiat au démarrage
  pool.query('SELECT 1').then(() => console.log('[Ping] DB connectée')).catch(e => console.error('[Ping] Erreur init:', e.message));
});
