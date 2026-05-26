const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'Planning HPA <onboarding@resend.dev>';

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
async function sendPlanningPublished({ to, employeeName, weekStart, shiftsCount }) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Votre planning a ete publie - Semaine du ' + weekStart,
      html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${employeeName},</p>
          <p>Votre planning pour la semaine du <strong>${weekStart}</strong> vient d'etre publie.</p>
          <div class="highlight">
            <strong>${shiftsCount} creneau(x)</strong> vous ont ete attribues cette semaine.
          </div>
          <p>Connectez-vous pour consulter vos horaires :</p>
          <a href="https://planning-frontend-production.up.railway.app" class="btn">Voir mon planning</a>
        </div>
      `)
    });
    console.log('Email planning publie envoye a', to);
  } catch (err) {
    console.error('Erreur email planning publie:', err.message);
  }
}

// Email : créneau modifié
async function sendShiftModified({ to, employeeName, date, oldStart, oldEnd, newStart, newEnd, note }) {
  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Votre creneau du ' + date + ' a ete modifie',
      html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${employeeName},</p>
          <p>Un de vos creneaux a ete modifie par votre manager.</p>
          <div class="warning">
            <strong>Date :</strong> ${date}<br>
            <strong>Ancien horaire :</strong> ${oldStart} - ${oldEnd}<br>
            <strong>Nouvel horaire :</strong> ${newStart} - ${newEnd}
            ${note ? '<br><strong>Poste :</strong> ' + note : ''}
          </div>
          <a href="https://planning-frontend-production.up.railway.app" class="btn">Voir mon planning</a>
        </div>
      `)
    });
    console.log('Email modification creneau envoye a', to);
  } catch (err) {
    console.error('Erreur email modification:', err.message);
  }
}

// Email : pointage hors périmètre
async function sendGeoAlert({ managerEmail, employeeName, action, distance, time }) {
  try {
    await resend.emails.send({
      from: FROM,
      to: managerEmail,
      subject: 'Alerte pointage hors site - ' + employeeName,
      html: baseTemplate(`
        <div class="content">
          <p>Alerte de geolocalisation :</p>
          <div class="danger">
            <strong>${employeeName}</strong> a pointe son ${action === 'in' ? 'arrivee' : 'depart'} 
            hors du perimetre autorise.<br>
            <strong>Distance du site :</strong> ${distance}m<br>
            <strong>Heure :</strong> ${time}
          </div>
          <p>Verifiez la presence de ce salarie.</p>
          <a href="https://planning-frontend-production.up.railway.app" class="btn">Voir le dashboard</a>
        </div>
      `)
    });
    console.log('Email alerte geo envoye au manager');
  } catch (err) {
    console.error('Erreur email geo:', err.message);
  }
}

// Email : demande d'échange de créneau
async function sendEchangeRequest({ managerEmail, employeeName, date, shiftTime, message }) {
  try {
    await resend.emails.send({
      from: FROM,
      to: managerEmail,
      subject: 'Demande d\'echange de creneau - ' + employeeName,
      html: baseTemplate(`
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${employeeName}</strong> demande un echange de creneau.</p>
          <div class="highlight">
            <strong>Creneau concerne :</strong> ${date} - ${shiftTime}<br>
            <strong>Message :</strong> ${message || 'Aucun message'}
          </div>
          <a href="https://planning-frontend-production.up.railway.app" class="btn">Voir le planning</a>
        </div>
      `)
    });
    console.log('Email echange envoye au manager');
  } catch (err) {
    console.error('Erreur email echange:', err.message);
  }
}

module.exports = {
  sendPlanningPublished,
  sendShiftModified,
  sendGeoAlert,
  sendEchangeRequest,
};
