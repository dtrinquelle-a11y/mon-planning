#!/usr/bin/env node
// Restauration d'une sauvegarde Planning HPA (fichier JSON telecharge depuis Parametrage > Sauvegardes).
//
// Usage :
//   DATABASE_URL="postgresql://postgres:MOTDEPASSE@..." node scripts/restaurer-sauvegarde.js sauvegarde.json [options]
//
// Options :
//   --essai            simulation : tout est fait dans une transaction annulee a la fin (rien n'est modifie)
//   --tables=a,b,c     ne restaurer que ces tables (ex : --tables=schedules,absence_requests)
//   --structure        base NEUVE uniquement : recree d'abord la structure (tables, regles d'acces, fonctions)
//                      a partir de celle contenue dans la sauvegarde, puis restaure les donnees
//
// Principe : les lignes de la sauvegarde ABSENTES de la base sont recreees ; les lignes deja presentes ne sont
// pas modifiees (ON CONFLICT DO NOTHING). On peut donc l'utiliser :
//   - sur une base neuve (avec --structure, ou apres avoir execute database/schema.sql) : restauration complete ;
//   - sur la base actuelle : pour recuperer des donnees supprimees par erreur, sans toucher au reste.
// Utiliser la chaine de connexion "postgres" du projet Supabase (Settings > Database), pas celle du backend.

const fs = require('fs');
const { Client } = require('pg');

// Ordre de restauration : les tables "parents" avant celles qui les referencent
const ORDER = [
  'employees', 'app_settings', 'onboarding_fields', 'onboarding_invitations', 'pointage_sites', 'changelog', 'dev_notes',
  'user_profiles', 'modulation_counter', 'schedules', 'work_declarations', 'timeclock', 'timeclock_alerts', 'absence_requests',
  'payroll_months', 'documents', 'onboarding_responses', 'week_templates', 'access_links',
  'planning_visibility', 'planning_preferences', 'planning_sector_members', 'mandatory_docs', 'mandatory_doc_signatures', 'work_declaration_history',
];

async function main() {
  const args = process.argv.slice(2);
  const file = args.find(a => !a.startsWith('--'));
  const essai = args.includes('--essai');
  const structure = args.includes('--structure');
  const only = (args.find(a => a.startsWith('--tables=')) || '').replace('--tables=', '').split(',').filter(Boolean);
  if (!file || !process.env.DATABASE_URL) {
    console.error('Usage : DATABASE_URL="..." node scripts/restaurer-sauvegarde.js sauvegarde.json [--essai] [--structure] [--tables=a,b]');
    process.exit(1);
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const data = json.donnees || json; // fichier telecharge depuis l'application, ou contenu brut
  console.log('Sauvegarde du ' + (json.date || '?') + (essai ? '  [SIMULATION : rien ne sera modifie]' : ''));

  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    if (structure) {
      if (!data._structure_sql) throw new Error('cette sauvegarde ne contient pas la structure : executer database/schema.sql puis relancer sans --structure');
      const already = await client.query("SELECT to_regclass('public.employees') AS t");
      if (already.rows[0].t) throw new Error('la base contient deja les tables : --structure est reserve a une base neuve');
      await client.query(data._structure_sql);
      console.log("  Structure recreee (tables, regles d'acces, fonctions)");
    }
    for (const table of ORDER) {
      if (only.length && !only.includes(table)) continue;
      const rows = data[table];
      if (!Array.isArray(rows) || !rows.length) continue;
      const exists = await client.query('SELECT to_regclass($1) AS t', ['public.' + table]);
      if (!exists.rows[0].t) { console.log('  ' + table.padEnd(24) + ' table absente de la base : ignoree'); continue; }
      // Les profils ne sont restaures que pour les comptes de connexion existants (sinon : lien d'acces a regenerer)
      const filter = table === 'user_profiles' ? ' WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.id)' : '';
      const res = await client.query(
        `INSERT INTO public.${table} SELECT * FROM json_populate_recordset(NULL::public.${table}, $1::json) x${filter} ON CONFLICT DO NOTHING`,
        [JSON.stringify(rows)]
      );
      console.log('  ' + table.padEnd(24) + ' ' + String(res.rowCount).padStart(5) + ' ligne(s) recreee(s) sur ' + rows.length);
    }
    await client.query(essai ? 'ROLLBACK' : 'COMMIT');
    console.log(essai ? '\nSimulation terminee : aucune modification enregistree.' : '\nRestauration terminee.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nErreur, rien n\'a ete modifie : ' + err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
