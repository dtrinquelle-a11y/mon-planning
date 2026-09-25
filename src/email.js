const { Resend } = require('resend');

// Sans cle, le serveur demarre quand meme et les emails sont simplement ignores
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
if (!resend) console.warn('RESEND_API_KEY manquante : les emails ne seront pas envoyes');
// L'adresse de test onboarding@resend.dev n'envoie qu'au proprietaire du compte Resend :
// definir EMAIL_FROM avec une adresse d'un domaine verifie dans Resend.
const FROM = process.env.EMAIL_FROM || 'Planning HPA <onboarding@resend.dev>';
const APP_URL = process.env.FRONTEND_URL || 'https://planning-frontend-production.up.railway.app';

// Echappe les valeurs inserees dans le HTML
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Resend ne leve pas d'exception en cas d'echec : il renvoie { data, error }
async function send(label, message) {
  if (!resend) return false;
  try {
    const { error } = await resend.emails.send({ from: FROM, ...message });
    if (error) {
      console.error('Erreur email ' + label + ':', error.message || error);
      return false;
    }
    console.log('Email ' + label + ' envoye a', message.to);
    return true;
  } catch (err) {
    console.error('Erreur email ' + label + ':', err.message);
    return false;
  }
}

// Template de base
function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Courier New', monospace; background: #0F1117; color: #E8E6DC; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #1A1D27; border: 1px solid #2A2D3A; border-radius: 12px; padding: 28px; }
    .logo { color: #7C6FCD; font-size: 16px; font-weight: bold; margin-bottom: 20px; }
    .content { font-size: 14px; line-height: 1.6; color: #E8E6DC; }
    .highlight { background: #2A1F4A; border: 1px solid #7C6FCD; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
    .warning { background: #3A2A10; border: 1px solid #F5A623; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #F5C870; }
    .danger { background: #3A1A1A; border: 1px solid #E85D5D; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #F0A0A0; }
    .footer { margin-top: 24px; font-size: 11px; color: #6B6E82; border-top: 1px solid #2A2D3A; padding-top: 14px; }
    .btn { display: inline-block; background: #7C6FCD; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: bold; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">▸ PLANNING HPA</div>
    ${content}
    <div class="footer">Le Bout du Monde · 2 chemin de Rhodes, 11400 Verdun-en-Lauragais<br>Ce message est automatique, merci de ne pas y repondre.</div>
  </div>
</body>
</html>`;
}

// Email : planning publié
function sendPlanningPublished({ to, employeeName, weekStart, shiftsCount }) {
  return send('planning publie', {
    to,
    subject: 'Votre planning a ete publie - Semaine du ' + weekStart,
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>Votre planning pour la semaine du <strong>${esc(weekStart)}</strong> vient d'etre publie.</p>
          <div class="highlight">
            <strong>${esc(shiftsCount)} creneau(x)</strong> vous ont ete attribues cette semaine.
          </div>
          <p>Connectez-vous pour consulter vos horaires :</p>
          <a href="${APP_URL}" class="btn">Voir mon planning</a>
        </div>
      `)
  });
}

// Email : créneau modifié
function sendShiftModified({ to, employeeName, date, oldStart, oldEnd, newStart, newEnd, note }) {
  return send('modification creneau', {
    to,
    subject: 'Votre creneau du ' + date + ' a ete modifie',
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>Un de vos creneaux a ete modifie par votre manager.</p>
          <div class="warning">
            <strong>Date :</strong> ${esc(date)}<br>
            <strong>Ancien horaire :</strong> ${esc(oldStart)} - ${esc(oldEnd)}<br>
            <strong>Nouvel horaire :</strong> ${esc(newStart)} - ${esc(newEnd)}
            ${note ? '<br><strong>Poste :</strong> ' + esc(note) : ''}
          </div>
          <a href="${APP_URL}" class="btn">Voir mon planning</a>
        </div>
      `)
  });
}

// Email : pointage hors périmètre
function sendGeoAlert({ managerEmail, employeeName, action, distance, time }) {
  return send('alerte geo', {
    to: managerEmail,
    subject: 'Alerte pointage hors site - ' + employeeName,
    html: baseTemplate(`
        <div class="content">
          <p>Alerte de geolocalisation :</p>
          <div class="danger">
            <strong>${esc(employeeName)}</strong> a pointe son ${action === 'in' ? 'arrivee' : 'depart'}
            hors du perimetre autorise.<br>
            <strong>Distance du site :</strong> ${esc(distance)}m<br>
            <strong>Heure :</strong> ${esc(time)}
          </div>
          <p>Verifiez la presence de ce salarie.</p>
          <a href="${APP_URL}" class="btn">Voir le dashboard</a>
        </div>
      `)
  });
}

// Email : demande d'échange de créneau
function sendEchangeRequest({ managerEmail, employeeName, date, shiftTime, message }) {
  return send('echange', {
    to: managerEmail,
    subject: 'Demande d\'echange de creneau - ' + employeeName,
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${esc(employeeName)}</strong> demande un echange de creneau.</p>
          <div class="highlight">
            <strong>Creneau concerne :</strong> ${esc(date)} - ${esc(shiftTime)}<br>
            <strong>Message :</strong> ${esc(message || 'Aucun message')}
          </div>
          <a href="${APP_URL}" class="btn">Voir le planning</a>
        </div>
      `)
  });
}

module.exports = {
  sendPlanningPublished,
  sendShiftModified,
  sendGeoAlert,
  sendEchangeRequest,
};
