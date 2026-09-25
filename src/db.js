require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Pool } = require('pg');

// Fuseau du camping : la base Supabase tourne en UTC
const TZ = 'Europe/Paris';
// Date du jour (heure de Paris), a utiliser a la place de CURRENT_DATE
const TODAY_SQL = `(now() AT TIME ZONE '${TZ}')::date`;

// Client Supabase uniquement si configure (sert a verifier les jetons de connexion)
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', err => console.error('Erreur DB :', err.message));

module.exports = { supabase, pool, TZ, TODAY_SQL };
