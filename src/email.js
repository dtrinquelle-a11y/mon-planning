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
    body { font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #F5F6FA; color: #111827; margin: 0; padding: 24px 12px; }
    .container { max-width: 520px; margin: 0 auto; background: #FFFFFF; border: 1px solid #E5E7EF; border-radius: 16px; padding: 32px; box-shadow: 0 4px 16px rgba(17,24,39,0.06); }
    .logo { margin-bottom: 24px; font-size: 16px; font-weight: 700; color: #111827; }
    .logo-badge { display: inline-block; background: #5B4FD6; color: #fff; font-size: 11px; font-weight: 700; padding: 6px 8px; border-radius: 8px; margin-right: 8px; vertical-align: middle; }
    .content { font-size: 15px; line-height: 1.6; color: #111827; }
    .highlight { background: #EEF0FF; border-left: 4px solid #5B4FD6; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
    .warning { background: #FFF8EB; border-left: 4px solid #D97706; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #78350F; }
    .danger { background: #FEF2F2; border-left: 4px solid #DC2626; border-radius: 8px; padding: 12px 16px; margin: 16px 0; color: #7F1D1D; }
    .footer { margin-top: 28px; font-size: 12px; color: #6B7280; border-top: 1px solid #EEF0F5; padding-top: 16px; }
    .btn { display: inline-block; background: #5B4FD6; color: #ffffff !important; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-size: 14px; font-weight: 600; margin-top: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><span class="logo-badge">HPA</span>Planning · Le Bout du Monde</div>
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

// Email : nouveau document disponible (bulletin de paie, contrat, attestation...)
function sendDocumentAvailable({ to, employeeName, docLabel }) {
  return send('document disponible', {
    to,
    subject: 'Nouveau document disponible : ' + docLabel,
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>Un nouveau document a ete depose dans votre espace :</p>
          <div class="highlight"><strong>${esc(docLabel)}</strong></div>
          <p>Retrouvez-le dans l'application, onglet <strong>Mes documents</strong>.</p>
          <a href="${APP_URL}" class="btn">Voir mes documents</a>
        </div>
      `)
  });
}

// Contact RH indique dans les emails (meme adresse que la politique de confidentialite)
const CONTACT_RH = process.env.CONTACT_RH || 'dominique@campingleboutdumonde.fr';

// Email J-7 : l'acces aux documents va se fermer (3 mois apres la fin du contrat)
function sendDocsAccessEnding({ to, employeeName, accessEndLabel }) {
  return send('fin acces documents J-7', {
    to,
    subject: 'Vos documents restent consultables jusqu\'au ' + accessEndLabel,
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>Votre contrat etant termine, l'acces a vos documents dans l'application (bulletins de paie, contrat, attestations) se fermera le :</p>
          <div class="warning"><strong>${esc(accessEndLabel)}</strong></div>
          <p>Pensez a les telecharger d'ici la, depuis l'onglet <strong>Mes documents</strong>.</p>
          <a href="${APP_URL}" class="btn">Telecharger mes documents</a>
        </div>
      `)
  });
}

// Email : l'acces aux documents est ferme
function sendDocsAccessClosed({ to, employeeName }) {
  return send('acces documents ferme', {
    to,
    subject: 'Acces a vos documents ferme',
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>L'acces a vos documents dans l'application Planning HPA est desormais ferme, 3 mois apres la fin de votre contrat.</p>
          <div class="highlight">Vos documents restent conserves par votre employeur. Pour obtenir une copie (par exemple un bulletin de paie), ecrivez a <strong>${esc(CONTACT_RH)}</strong>.</div>
          <p>Merci pour votre saison parmi nous !</p>
        </div>
      `)
  });
}

// Email aux managers : nouvelle demande d'absence
function sendAbsenceRequested({ to, employeeName, typeLabel, periodLabel, comment }) {
  return send('demande absence', {
    to,
    subject: 'Demande d\'absence - ' + employeeName + ' (' + typeLabel + ')',
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${esc(employeeName)}</strong> a fait une demande d'absence :</p>
          <div class="highlight">
            <strong>${esc(typeLabel)}</strong><br>
            ${esc(periodLabel)}
            ${comment ? '<br><em>« ' + esc(comment) + ' »</em>' : ''}
          </div>
          <a href="${APP_URL}" class="btn">Traiter la demande</a>
        </div>
      `)
  });
}

// Email au salarie : decision sur sa demande d'absence
function sendAbsenceDecided({ to, employeeName, typeLabel, periodLabel, accepted, managerComment, requestedLabel }) {
  const decision = accepted ? (requestedLabel ? 'acceptee avec modification des dates' : 'acceptee') : 'refusee';
  return send('decision absence', {
    to,
    subject: 'Votre demande d\'absence a ete ' + decision,
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>Votre demande d'absence a ete <strong>${decision}</strong> :</p>
          <div class="${accepted ? (requestedLabel ? 'warning' : 'highlight') : 'danger'}">
            <strong>${esc(typeLabel)}</strong><br>
            ${requestedLabel ? 'Dates retenues : ' : ''}${esc(periodLabel)}
            ${requestedLabel ? '<br>Vous aviez demande : ' + esc(requestedLabel) : ''}
            ${managerComment ? '<br>Commentaire : <em>' + esc(managerComment) + '</em>' : ''}
          </div>
          <a href="${APP_URL}" class="btn">Voir mes absences</a>
        </div>
      `)
  });
}

// Email au salarie : absence deja acceptee, modifiee ou annulee par l'employeur
function sendAbsenceChanged({ to, employeeName, typeLabel, periodLabel, cancelled, managerComment, requestedLabel }) {
  return send('absence ' + (cancelled ? 'annulee' : 'modifiee'), {
    to,
    subject: 'Votre absence a ete ' + (cancelled ? 'annulee' : 'modifiee'),
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour ${esc(employeeName)},</p>
          <p>${cancelled ? 'Votre absence suivante a ete <strong>annulee</strong> par votre responsable :' : 'Les dates de votre absence ont ete <strong>modifiees</strong> par votre responsable :'}</p>
          <div class="${cancelled ? 'danger' : 'warning'}">
            <strong>${esc(typeLabel)}</strong><br>
            ${cancelled ? '' : 'Nouvelles dates : '}${esc(periodLabel)}
            ${!cancelled && requestedLabel ? '<br>Dates demandees initialement : ' + esc(requestedLabel) : ''}
            ${managerComment ? '<br>Motif : <em>' + esc(managerComment) + '</em>' : ''}
          </div>
          <p>Pour toute question, rapprochez-vous de votre responsable.</p>
          <a href="${APP_URL}" class="btn">Voir mes absences</a>
        </div>
      `)
  });
}

// Email aux managers : oubli de pointage (arrivee ou depart)
function sendTimeclockMissing({ to, employeeName, kind, dateLabel, shiftLabel }) {
  const what = kind === 'arrivee' ? 'son arrivee' : 'son depart';
  return send('oubli pointage ' + kind, {
    to,
    subject: 'Pointage manquant - ' + employeeName + ' (' + (kind === 'arrivee' ? 'arrivee' : 'depart') + ')',
    html: baseTemplate(`
        <div class="content">
          <p>Bonjour,</p>
          <p><strong>${esc(employeeName)}</strong> n'a pas pointe ${what} :</p>
          <div class="warning">
            Creneau du <strong>${esc(dateLabel)}</strong> · ${esc(shiftLabel)}
          </div>
          <p>Verifiez sa presence ou un eventuel oubli de pointage.</p>
          <a href="${APP_URL}" class="btn">Voir le realise</a>
        </div>
      `)
  });
}

module.exports = {
  sendTimeclockMissing,
  sendAbsenceChanged,
  sendAbsenceRequested,
  sendAbsenceDecided,
  sendDocsAccessEnding,
  sendDocsAccessClosed,
  sendDocumentAvailable,
  sendPlanningPublished,
  sendShiftModified,
  sendGeoAlert,
  sendEchangeRequest,
};
