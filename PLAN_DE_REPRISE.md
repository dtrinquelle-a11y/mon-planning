# Plan de reprise — Planning HPA

Que faire si un service tombe en panne en pleine saison. À garder aussi **hors de l'ordinateur** (imprimé ou dans le Drive), avec une sauvegarde récente.

## L'architecture en 30 secondes

| Brique | Rôle | Hébergeur |
|---|---|---|
| Frontend (`planning-frontend`) | Les écrans de l'application | Railway |
| Backend (`mon-planning`) | Le serveur : calculs, emails, alertes, sauvegardes de nuit | Railway |
| Base de données + comptes + fichiers | Toutes les données, les connexions, les pièces RH | Supabase |
| Code source | Les deux dépôts | GitHub |
| Emails | Envoi des emails (planning@campingleboutdumonde.fr) | Resend + DNS chez Gandi |

## Habitudes à prendre (5 min par semaine)

1. **Chaque lundi** : Paramétrage › Sauvegardes › « Télécharger » sur la plus récente, puis ranger le fichier dans le Drive. Il contient les données **et** la structure de la base : c'est tout ce qu'il faut pour tout reconstruire.
2. **Avant une grosse manipulation** (import, suppression en lot) : « Sauvegarder maintenant ».
3. Garder dans un gestionnaire de mots de passe : les accès Railway, Supabase, GitHub, Resend et Gandi, le mot de passe du rôle `planning_app`, et la **clé de chiffrement des données sensibles** (Paramétrage › Rôles et droits › « Télécharger la clé de secours »). Cette clé ne doit **jamais** être rangée avec les sauvegardes : c'est elle qui protège le n° de sécurité sociale et l'IBAN si un fichier de sauvegarde fuite.

> Le fichier de sauvegarde contient des données personnelles (RGPD) : Drive privé uniquement, jamais par email.

---

## Scénario par service

### GitHub en panne
**Aucun impact** : l'application tourne déjà sur Railway. Seules les mises à jour sont bloquées. Il suffit d'attendre.

### Resend ou Gandi en panne
Seuls les **emails** sont touchés (alertes de pointage, réponses aux absences, mot de passe oublié). Le planning, la pointeuse et les absences continuent de fonctionner. Il suffit de prévenir l'équipe et d'attendre.

### Railway en panne (frontend et/ou backend)
Les données sont intactes (elles sont chez Supabase). Il suffit de redéployer les deux applications chez un autre hébergeur (Render, Fly.io, Vercel pour le frontend…) :

1. **Backend** : créer un service web Node à partir du dépôt GitHub `mon-planning`. Commande de démarrage : `npm start`. Recopier les variables (voir la liste plus bas).
2. **Frontend** : créer un site à partir du dépôt `planning-frontend`. Build : `npm run build`, dossier publié : `build`. Définir la variable :
   - `REACT_APP_API_URL` = adresse du nouveau backend (ex. `https://mon-planning.onrender.com`)
3. Dans le backend, mettre à jour `CORS_ORIGIN` et `FRONTEND_URL` avec l'adresse du nouveau frontend.
4. Dans Supabase › Authentication › URL Configuration, ajouter la nouvelle adresse du frontend (Site URL et Redirect URLs, avec `/reinitialiser`).
5. **Réimprimer les QR codes de pointage** (page QR codes), car ils contiennent l'adresse du site.

> Avec un domaine à soi (ex. `planning.campingleboutdumonde.fr`) pointé vers le frontend, les étapes 4 et 5 deviennent inutiles : il suffit de repointer le domaine.

### Supabase en panne
- **Panne temporaire** (le cas le plus fréquent) : l'application est inutilisable le temps de la panne, sans aucune perte. On attend ; l'état est visible sur status.supabase.com.
- **Perte du projet** (très rare) : reconstruire sur un nouveau projet, voir la procédure complète ci-dessous.

---

## Procédure complète : reconstruire la base sur un nouveau projet Supabase

Durée : environ 1 h. Il faut : le dernier fichier de sauvegarde (`sauvegarde-planning-hpa_….json`), Node.js installé sur un ordinateur et le dépôt `mon-planning` (copie locale ou téléchargement ZIP depuis GitHub).

**1. Créer le projet.** Sur supabase.com, créer un nouveau projet (région Europe, Paris ou Francfort). Noter le mot de passe de la base.

**2. Recréer la structure et les données en une commande.** Dans Settings › Database, copier la chaîne de connexion « postgres » (Session pooler), puis dans le dossier `mon-planning` :

```
npm install
DATABASE_URL="postgresql://postgres....:MOTDEPASSE@....pooler.supabase.com:5432/postgres" node scripts/restaurer-sauvegarde.js sauvegarde-planning-hpa_XXXX.json --structure --essai
```

`--essai` lance une simulation et n'enregistre rien. Si elle se termine sans erreur, relancer la même commande **sans** `--essai`.

*(Variante si la sauvegarde est ancienne et ne contient pas la structure : coller le contenu de `database/schema.sql` dans le SQL Editor de Supabase, l'exécuter, puis lancer la commande sans `--structure`.)*

**3. Donner un mot de passe au rôle du serveur.** Dans le SQL Editor :

```sql
ALTER ROLE planning_app PASSWORD 'un-mot-de-passe-long';
```

La nouvelle `DATABASE_URL` du backend reprend la chaîne « Session pooler » en remplaçant l'utilisateur par `planning_app.<ref-du-projet>` et en mettant ce mot de passe.

**3 bis. Remettre la clé de chiffrement.** Le n° de sécurité sociale et l'IBAN sont chiffrés ; la clé n'est pas dans la sauvegarde. Reprendre la clé de secours dans le gestionnaire de mots de passe et l'exécuter dans le SQL Editor :

```sql
INSERT INTO public.server_secrets (key, value) VALUES ('cle_donnees_sensibles', 'LA-CLE-DE-SECOURS')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

Sans cette clé, ces deux informations restent illisibles (tout le reste fonctionne) : il faudrait les redemander aux salariés.

**4. Réglages Supabase à refaire** (Authentication) :
- **Sign In / Providers › Email** : désactiver « Confirm email ».
- **URL Configuration** : Site URL = adresse du frontend, Redirect URLs = `https://<frontend>/reinitialiser`.
- **SMTP Settings** (Emails) : activer le SMTP personnalisé de Resend. Hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = une clé API Resend, expéditeur `planning@campingleboutdumonde.fr`, nom « Planning HPA ».
- **Email Templates › Reset password** : reprendre le modèle au style de l'application (sinon, celui de Supabase par défaut fonctionne aussi).

**5. Brancher les applications sur le nouveau projet.**
- Backend : `DATABASE_URL` (étape 3), `SUPABASE_URL` et `SUPABASE_ANON_KEY` (Settings › API).
- Frontend : `REACT_APP_SUPABASE_URL` et `REACT_APP_SUPABASE_ANON_KEY`, puis redéployer.

**6. Recréer les accès.** Les comptes de connexion (emails et mots de passe) ne sont **pas** dans la sauvegarde, pour des raisons de sécurité. Les fiches salariés, plannings, pointages, etc. sont bien là.
- **Managers** : créer chaque compte dans Authentication › Users › « Add user » (avec l'email de sa fiche salarié), puis lui donner son rôle dans le SQL Editor :
  ```sql
  UPDATE public.user_profiles
     SET role = 'admin',   -- ou 'manager'
         employee_id = (SELECT id FROM public.employees WHERE lower(email) = lower('prenom@exemple.fr'))
   WHERE id = (SELECT id FROM auth.users WHERE lower(email) = lower('prenom@exemple.fr'));
  ```
- **Salariés** : depuis Dossiers RH, envoyer à chacun un **lien de premier accès**. Ils choisissent leur mot de passe et retrouvent tout leur historique.

**7. Ce qui est perdu** :
- les **fichiers** déposés (pièces d'onboarding, bulletins, photos de pointage, documents à signer) : la sauvegarde contient leurs références, pas les fichiers eux-mêmes. Il faut redéposer les documents importants (les signatures déjà faites restent enregistrées) ;
- les données saisies entre la dernière sauvegarde téléchargée et la panne.

---

## Variables d'environnement (noms seulement, les valeurs sont dans Railway et le gestionnaire de mots de passe)

**Backend (`mon-planning`)**

| Variable | Contenu |
|---|---|
| `DATABASE_URL` | Connexion à la base avec le rôle `planning_app` (pas `postgres`) |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Clé publique « anon » du projet |
| `RESEND_API_KEY` | Clé API Resend |
| `EMAIL_FROM` | `Planning HPA <planning@campingleboutdumonde.fr>` |
| `REQUIRE_AUTH` | `true` |
| `CORS_ORIGIN` | Adresse du frontend |
| `FRONTEND_URL` | Adresse du frontend (liens dans les emails) |
| `CONTACT_RH` | Facultatif : email de contact RH affiché aux anciens salariés |
| `REPLY_TO` | Facultatif : adresse qui reçoit les réponses aux emails (par défaut `CONTACT_RH`) |

**Frontend (`planning-frontend`)** : toutes facultatives, les valeurs par défaut sont dans `src/config.js`.

| Variable | Contenu |
|---|---|
| `REACT_APP_API_URL` | Adresse du backend |
| `REACT_APP_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | Clé publique « anon » |

## Emails : DNS chez Gandi

Le domaine `campingleboutdumonde.fr` est vérifié dans Resend grâce à des enregistrements DNS (DKIM `resend._domainkey`, ainsi que SPF et MX sur `send`). Ils sont visibles dans Resend › Domains. **Ils ne dépendent ni de Railway ni de Supabase** : rien à refaire lors d'un changement d'hébergeur. À ne pas supprimer chez Gandi.

## Récupérer une donnée supprimée par erreur (sans panne)

Le même script remet les lignes manquantes **sans toucher au reste** :

```
DATABASE_URL="<chaîne postgres du projet actuel>" node scripts/restaurer-sauvegarde.js sauvegarde.json --tables=schedules --essai
```

Puis relancer sans `--essai`. Tables utiles : `schedules` (créneaux), `absence_requests`, `timeclock` (pointages), `employees`, `week_templates`.

## Sauvegardes automatiques

- Chaque nuit vers 3 h (backend, `src/jobs/backups.js`) : 31 sauvegardes en rotation.
- Les 10 dernières sauvegardes manuelles sont conservées.
- Stockées dans la table `data_backups` **du même projet Supabase** : elles protègent contre une erreur de manipulation, pas contre la perte du projet. D'où le téléchargement hebdomadaire vers le Drive.
