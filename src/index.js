require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { pool, TZ } = require('./db');
const { requireAuth } = require('./auth');
const { startDocsAccessJob } = require('./jobs/docsAccess');
const { startTimeclockAlertsJob } = require('./jobs/timeclockAlerts');
const { startBackupJob } = require('./jobs/backups');
const { startDeclarationsJob } = require('./jobs/declarations');

const app = express();
// CORS_ORIGIN : liste d'origines autorisees separees par des virgules (toutes si absent)
const corsOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) : '*';
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: '10mb' })); // 10mb pour les photos base64

// Routes
const employeesRouter = require('./routes/employees');
const schedulesRouter = require('./routes/schedules');
const timeclockRouter = require('./routes/timeclock');
const settingsRouter = require('./routes/settings');
const documentsRouter = require('./routes/documents');
const absencesRouter = require('./routes/absences');
const exportsRouter = require('./routes/exports');
const reportsRouter = require('./routes/reports');
const mandatoryDocsRouter = require('./routes/mandatoryDocs');

// Health check (public)
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api', requireAuth);
app.use('/api/employees', employeesRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/timeclock', timeclockRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/documents', documentsRouter);
app.use('/api/absences', absencesRouter);
app.use('/api/exports', exportsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/mandatory-docs', mandatoryDocsRouter);

// Ping DB toutes les 9 minutes pour éviter mise en pause Supabase
setInterval(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('[Ping] DB ok -', new Date().toLocaleTimeString('fr-FR', { timeZone: TZ }));
  } catch (e) {
    console.error('[Ping] DB error:', e.message);
  }
}, 9 * 60 * 1000);

// Emails de fin d'acces aux documents (J-7 et fermeture)
startDocsAccessJob();
// Alertes d'oubli de pointage (si activees dans la page Realise)
startTimeclockAlertsJob();
// Sauvegarde automatique de toutes les donnees chaque nuit (vers 3 h)
startBackupJob();
// Pointeuse desactivee : recapitulatif du dimanche 18 h et cloture du lundi
startDeclarationsJob();

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log('Serveur Planning HPA sur port ' + PORT);
  pool.query('SELECT 1').then(() => console.log('[Ping] DB connectée')).catch(e => console.error('[Ping] Erreur init:', e.message));
});
