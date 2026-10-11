const { pool, TZ } = require('../db');

// Sauvegarde automatique de toutes les donnees chaque nuit vers 3 h (heure de Paris).
// La fonction SQL create_backup_snapshot('auto') ecrit dans data_backups (slot "auto-JJ" : ~31 jours en rotation).
let lastRunDay = null;

async function runNightlyBackup() {
  const now = new Date();
  const parisHour = parseInt(now.toLocaleString('fr-FR', { timeZone: TZ, hour: '2-digit', hour12: false }), 10);
  const parisDay = now.toLocaleDateString('fr-FR', { timeZone: TZ });
  if (parisHour !== 3 || lastRunDay === parisDay) return;
  lastRunDay = parisDay;
  const { rows } = await pool.query("SELECT public.create_backup_snapshot('auto') AS r");
  const r = rows[0].r;
  console.log('[Sauvegarde] ' + r.slot + ' creee (' + Math.round(r.size_bytes / 1024) + ' Ko)');
}

function startBackupJob() {
  const run = () => runNightlyBackup().catch(err => console.error('[Sauvegarde] Erreur :', err.message));
  setInterval(run, 15 * 60 * 1000); // verification toutes les 15 min, execution une fois entre 3 h et 4 h
}

module.exports = { startBackupJob, runNightlyBackup };
