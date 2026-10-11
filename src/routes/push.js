const express = require('express');
const router = express.Router();
const { publicKey, sendToUsers } = require('../push');

// GET /api/push/public-key -> cle publique de l'application (necessaire pour s'abonner)
router.get('/public-key', async (req, res) => {
  try { res.json({ key: await publicKey() }); } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/push/test -> notification d'essai sur les appareils du compte connecte
router.post('/test', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Non authentifie' });
  try {
    const sent = await sendToUsers([req.user.id], { title: 'Notifications activées ✓', body: 'Vous recevrez ici votre planning, vos absences et vos rappels.', tag: 'test' });
    res.json({ sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
