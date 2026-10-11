const webpush = require('web-push');
const { pool } = require('./db');

// Notifications sur le telephone (Web Push).
// Les cles de l'application sont generees au premier demarrage et conservees dans server_secrets (lisible par le serveur seul).
let ready = null;

function init() {
  if (!ready) {
    ready = (async () => {
      const { rows } = await pool.query("SELECT key, value FROM server_secrets WHERE key IN ('vapid_public', 'vapid_private')");
      let pub = rows.find(r => r.key === 'vapid_public')?.value;
      let priv = rows.find(r => r.key === 'vapid_private')?.value;
      if (!pub || !priv) {
        const k = webpush.generateVAPIDKeys();
        await pool.query("INSERT INTO server_secrets (key, value) VALUES ('vapid_public', $1), ('vapid_private', $2) ON CONFLICT (key) DO NOTHING", [k.publicKey, k.privateKey]);
        // Si un autre demarrage a ecrit des cles entre-temps, on relit celles de la base
        const again = await pool.query("SELECT key, value FROM server_secrets WHERE key IN ('vapid_public', 'vapid_private')");
        pub = again.rows.find(r => r.key === 'vapid_public').value;
        priv = again.rows.find(r => r.key === 'vapid_private').value;
        console.log('[Notifications] Cles de l\'application creees');
      }
      webpush.setVapidDetails('mailto:' + (process.env.CONTACT_RH || 'planning@campingleboutdumonde.fr'), pub, priv);
      return pub;
    })().catch(err => { ready = null; throw err; });
  }
  return ready;
}

const publicKey = () => init();

// Envoie a tous les appareils des comptes donnes ; supprime les abonnements expires
async function sendToUsers(userIds, payload) {
  if (!userIds.length) return 0;
  await init();
  const { rows } = await pool.query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [userIds]);
  let sent = 0;
  await Promise.all(rows.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url || '/', tag: payload.tag }), { TTL: 24 * 3600 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [s.endpoint]);
      else console.error('[Notifications] Envoi impossible :', err.statusCode || err.message);
    }
  }));
  return sent;
}

// Salaries (par fiche) -> comptes de connexion -> appareils
async function notifyEmployees(employeeIds, payload) {
  try {
    const ids = [...new Set(employeeIds.filter(Boolean))];
    if (!ids.length) return 0;
    const { rows } = await pool.query('SELECT id FROM user_profiles WHERE employee_id = ANY($1::uuid[])', [ids]);
    return await sendToUsers(rows.map(r => r.id), payload);
  } catch (err) { console.error('[Notifications] Erreur :', err.message); return 0; }
}

async function notifyManagers(payload) {
  try {
    const { rows } = await pool.query("SELECT id FROM user_profiles WHERE role IN ('admin', 'manager')");
    return await sendToUsers(rows.map(r => r.id), payload);
  } catch (err) { console.error('[Notifications] Erreur :', err.message); return 0; }
}

module.exports = { publicKey, notifyEmployees, notifyManagers, sendToUsers };
