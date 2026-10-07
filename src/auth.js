const { supabase, pool } = require('./db');

// Interrupteur : tant que REQUIRE_AUTH n'est pas "true", les requetes sans jeton valide passent quand meme
// (elles sont seulement signalees dans les logs). Permet de deployer puis d'activer sans coupure.
const enforce = () => process.env.REQUIRE_AUTH === 'true';

// Cache court des jetons deja verifies, pour ne pas interroger Supabase a chaque requete
const cache = new Map();
const CACHE_MS = 60 * 1000;

async function resolveUser(token) {
  const hit = cache.get(token);
  if (hit && hit.expires > Date.now()) return hit.user;
  if (!supabase) throw new Error('Authentification non configuree (SUPABASE_URL / SUPABASE_ANON_KEY)');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    console.warn('[Auth] Jeton refuse :', error ? error.message : 'utilisateur introuvable');
    return null;
  }
  const { rows } = await pool.query('SELECT role, employee_id FROM user_profiles WHERE id = $1', [data.user.id]);
  const profile = rows[0] || {};
  const user = {
    id: data.user.id,
    email: data.user.email,
    role: profile.role || 'salarie',
    employeeId: profile.employee_id || null,
    isManager: profile.role === 'admin' || profile.role === 'manager',
  };
  cache.set(token, { user, expires: Date.now() + CACHE_MS });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return user;
}

// Identifie l'utilisateur a partir du header "Authorization: Bearer <jeton Supabase>" -> req.user
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  try {
    req.user = token ? await resolveUser(token) : null;
  } catch (err) {
    console.error('[Auth] Erreur verification jeton :', err.message);
    req.user = null;
  }
  if (!req.user) {
    if (enforce()) return res.status(401).json({ error: 'Non authentifie' });
    console.warn('[Auth] Requete sans jeton valide (tolere) :', req.method, req.originalUrl);
  }
  next();
}

// Reserve une route aux managers/admins (applique seulement quand l'interrupteur est actif)
function managerOnly(req, res, next) {
  if (!enforce() || req.user?.isManager) return next();
  res.status(403).json({ error: 'Reserve aux managers' });
}

// Salarie identifie (non manager) : ses acces sont limites a ses propres donnees
const isEmployeeScoped = req => !!req.user && !req.user.isManager;

module.exports = { requireAuth, managerOnly, isEmployeeScoped };
