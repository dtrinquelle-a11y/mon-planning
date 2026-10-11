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
const pushRouter = require('./routes/push');

// Health check (public) : /health = le serveur repond ; /health?db=1 = il joint aussi la base (surveillance externe)
app.get('/health', async (req, res) => {
  if (!req.query.db) return res.json({ status: 'ok', timestamp: new Date().toISOString() });
  try {
    await Promise.race([pool.query('SELECT 1'), new Promise((_, reject) => setTimeout(() => reject(new Error('delai depasse')), 5000))]);
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'erreur', db: err.message || err.code || 'base injoignable' });
  }
});

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
app.use('/api/push', pushRouter);

// Toute erreur non prevue dans une route : reponse JSON propre, le serveur continue de tourner
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Erreur]', req.method, req.originalUrl, err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Requete invalide' : 'Erreur serveur' });
});

// Promesse en erreur oubliee : on la journalise sans arreter le serveur
process.on('unhandledRejection', err => console.error('[Erreur non geree]', err && err.message ? err.message : err));
// Erreur fatale : on journalise puis on quitte, Railway redemarre automatiquement le serveur
process.on('uncaughtException', err => { console.error('[Erreur fatale]', err && err.stack ? err.stack : err); process.exit(1); });

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
const server = app.listen(PORT, () => {
  console.log('Serveur Planning HPA sur port ' + PORT);
  pool.query('SELECT 1').then(() => console.log('[Ping] DB connectée')).catch(e => console.error('[Ping] Erreur init:', e.message));
});

// Arret propre lors d'un redeploiement : on termine les requetes en cours et on ferme les connexions a la base
process.on('SIGTERM', () => {
  console.log('[Arret] Redemarrage demande, fermeture propre...');
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(0), 10000).unref();
});
