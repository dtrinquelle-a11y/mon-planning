const { supabase } = require('./db');

// Verifie le jeton Supabase envoye par le frontend (header "Authorization: Bearer <token>").
// Active seulement si REQUIRE_AUTH=true, pour ne pas bloquer un frontend qui n'envoie pas encore le jeton.
async function requireAuth(req, res, next) {
  if (process.env.REQUIRE_AUTH !== 'true') return next();
  if (!supabase) return res.status(500).json({ error: 'Authentification non configuree' });

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non authentifie' });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Session invalide' });
    req.user = data.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session invalide' });
  }
}

module.exports = { requireAuth };
