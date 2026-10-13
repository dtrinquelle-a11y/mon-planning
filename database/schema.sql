-- Structure Planning HPA, generee le 13/10/2026 21:44
-- A executer sur un projet Supabase NEUF (SQL Editor), avant la restauration des donnees.
-- Apres execution : definir le mot de passe du role planning_app (ALTER ROLE planning_app PASSWORD ...)
-- et mettre a jour DATABASE_URL du backend.

SET check_function_bodies = off;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $r$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'planning_app') THEN CREATE ROLE planning_app LOGIN; END IF; END $r$;
GRANT USAGE ON SCHEMA public TO planning_app;

-- ===== Tables =====
CREATE TABLE IF NOT EXISTS public.absence_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  comment text,
  status text NOT NULL DEFAULT 'en_attente'::text,
  manager_comment text,
  decided_by uuid,
  decided_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  original_start_date date,
  original_end_date date,
  closure_id uuid
);

CREATE TABLE IF NOT EXISTS public.access_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
  used_at timestamp with time zone,
  used_by uuid,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL,
  label text,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.availabilities (
  employee_id uuid NOT NULL,
  day date NOT NULL,
  status text NOT NULL,
  note text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.changelog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  title text,
  items text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consignes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service text NOT NULL,
  weekday integer,
  day date,
  texte text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.contract_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  last_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.data_backups (
  slot text NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  size_bytes integer,
  row_counts jsonb,
  data jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS public.dev_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text NOT NULL,
  author text DEFAULT 'Anonyme'::text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  periode text,
  uploaded_by uuid,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  role text NOT NULL,
  email text NOT NULL,
  phone text,
  contract_hours numeric(5,2) NOT NULL DEFAULT 35,
  contract_type text NOT NULL DEFAULT 'CDI'::text,
  is_active boolean NOT NULL DEFAULT true,
  hire_date date,
  created_at timestamp with time zone DEFAULT now(),
  service text NOT NULL DEFAULT 'Accueil'::text,
  onboarding_completed boolean DEFAULT false,
  address text,
  birth_date date,
  nss text,
  services_secondaires text,
  sort_order integer DEFAULT 0,
  is_temp boolean DEFAULT false,
  contract_end_date date,
  docs_reminder_sent_for date,
  docs_closed_sent_for date,
  emploi_repere text,
  categorie text,
  coefficient integer,
  salaire_horaire numeric(8,2),
  periode_essai text,
  taches text,
  logement boolean NOT NULL DEFAULT false,
  logement_details text,
  civilite text,
  contrat_genere_at timestamp with time zone,
  contrat_signe_at timestamp with time zone,
  contrat_signe_debut date,
  contrat_signe_doc uuid,
  logement_pieces integer NOT NULL DEFAULT 1,
  caution_recue_at timestamp with time zone,
  nss_enc bytea,
  cp_init_date date,
  cp_init_n1 numeric(6,2),
  cp_init_n numeric(6,2)
);

CREATE TABLE IF NOT EXISTS public.mandatory_doc_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  version integer NOT NULL,
  signed_at timestamp with time zone NOT NULL DEFAULT now(),
  method text NOT NULL DEFAULT 'en_ligne'::text,
  signed_name text,
  user_id uuid,
  user_agent text,
  recorded_by uuid
);

CREATE TABLE IF NOT EXISTS public.mandatory_docs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  kind text NOT NULL,
  file_path text,
  file_name text,
  mime_type text,
  file_size integer,
  video_url text,
  renewal text NOT NULL DEFAULT 'annuel'::text,
  version integer NOT NULL DEFAULT 1,
  version_date timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  previous_versions jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_signature boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.modulation_counter (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  period_start date NOT NULL DEFAULT '2026-11-01'::date,
  period_end date NOT NULL DEFAULT '2027-10-31'::date,
  planned_hours numeric(7,2) NOT NULL DEFAULT 0,
  worked_hours numeric(7,2) NOT NULL DEFAULT 0,
  legal_threshold numeric(7,2) NOT NULL DEFAULT 1607,
  threshold_25 numeric(7,2) NOT NULL DEFAULT 1790,
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  field_type text NOT NULL,
  required boolean DEFAULT true,
  options text,
  max_file_size_kb integer DEFAULT 2048,
  accepted_formats text DEFAULT '.pdf,.jpg,.jpeg,.png'::text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  show_if_field_id uuid,
  show_if_value text
);

CREATE TABLE IF NOT EXISTS public.onboarding_invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  code text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_responses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  field_id uuid,
  value text,
  created_at timestamp with time zone DEFAULT now(),
  value_enc bytea
);

CREATE TABLE IF NOT EXISTS public.payroll_months (
  employee_id uuid NOT NULL,
  month text NOT NULL,
  overtime_computed numeric NOT NULL DEFAULT 0,
  overtime_paid numeric NOT NULL DEFAULT 0,
  overtime_banked numeric NOT NULL DEFAULT 0,
  validated_at timestamp with time zone NOT NULL DEFAULT now(),
  validated_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.personnel_register (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  nom text NOT NULL,
  prenoms text NOT NULL,
  sexe text,
  nationalite text,
  date_naissance date,
  emploi text,
  qualification text,
  type_contrat text,
  temps_partiel boolean NOT NULL DEFAULT false,
  heures numeric(5,2),
  entree date NOT NULL,
  sortie date,
  titre_travail_type text,
  titre_travail_numero text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planning_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service text NOT NULL,
  emp_order jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planning_sector_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service text NOT NULL,
  employee_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planning_visibility (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid,
  service text NOT NULL,
  week_start date NOT NULL,
  is_visible boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pointage_sites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  latitude numeric(10,7) NOT NULL,
  longitude numeric(10,7) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 200,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  shift_type text NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  service text
);

CREATE TABLE IF NOT EXISTS public.sensitive_access_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  employee_id uuid,
  field text NOT NULL,
  reason text,
  at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.server_secrets (
  key text NOT NULL,
  value text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.timeclock (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  action text NOT NULL,
  scanned_at timestamp with time zone NOT NULL DEFAULT now(),
  is_late boolean NOT NULL DEFAULT false,
  late_minutes integer DEFAULT 0,
  schedule_id uuid,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  latitude numeric(10,7),
  longitude numeric(10,7),
  geo_valid boolean DEFAULT false,
  device text DEFAULT 'web'::text,
  photo_path text,
  declaration_id uuid
);

CREATE TABLE IF NOT EXISTS public.timeclock_alerts (
  schedule_id uuid NOT NULL,
  kind text NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL,
  employee_id uuid,
  role text NOT NULL DEFAULT 'salarie'::text,
  first_login boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS public.week_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  service text NOT NULL,
  shifts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE TABLE IF NOT EXISTS public.work_declaration_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  declaration_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL,
  start_time time without time zone,
  end_time time without time zone,
  break_minutes integer NOT NULL DEFAULT 0,
  comment text,
  declared_at timestamp with time zone NOT NULL,
  by_manager boolean NOT NULL DEFAULT false,
  replaced_at timestamp with time zone NOT NULL DEFAULT now(),
  replaced_by_manager boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.work_declarations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  status text NOT NULL,
  start_time time without time zone,
  end_time time without time zone,
  break_minutes integer NOT NULL DEFAULT 0,
  comment text,
  declared_at timestamp with time zone NOT NULL DEFAULT now(),
  declared_by uuid,
  by_manager boolean NOT NULL DEFAULT false,
  revisions integer NOT NULL DEFAULT 0
);

-- ===== Contraintes =====
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_pkey PRIMARY KEY (id);
ALTER TABLE public.access_links ADD CONSTRAINT access_links_pkey PRIMARY KEY (id);
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);
ALTER TABLE public.availabilities ADD CONSTRAINT availabilities_pkey PRIMARY KEY (employee_id, day);
ALTER TABLE public.changelog ADD CONSTRAINT changelog_pkey PRIMARY KEY (id);
ALTER TABLE public.consignes ADD CONSTRAINT consignes_pkey PRIMARY KEY (id);
ALTER TABLE public.contract_templates ADD CONSTRAINT contract_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.data_backups ADD CONSTRAINT data_backups_pkey PRIMARY KEY (slot);
ALTER TABLE public.dev_notes ADD CONSTRAINT dev_notes_pkey PRIMARY KEY (id);
ALTER TABLE public.documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE public.employees ADD CONSTRAINT employees_pkey PRIMARY KEY (id);
ALTER TABLE public.mandatory_doc_signatures ADD CONSTRAINT mandatory_doc_signatures_pkey PRIMARY KEY (id);
ALTER TABLE public.mandatory_docs ADD CONSTRAINT mandatory_docs_pkey PRIMARY KEY (id);
ALTER TABLE public.modulation_counter ADD CONSTRAINT modulation_counter_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_fields ADD CONSTRAINT onboarding_fields_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_invitations ADD CONSTRAINT onboarding_invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.onboarding_responses ADD CONSTRAINT onboarding_responses_pkey PRIMARY KEY (id);
ALTER TABLE public.payroll_months ADD CONSTRAINT payroll_months_pkey PRIMARY KEY (employee_id, month);
ALTER TABLE public.personnel_register ADD CONSTRAINT personnel_register_pkey PRIMARY KEY (id);
ALTER TABLE public.planning_preferences ADD CONSTRAINT planning_preferences_pkey PRIMARY KEY (id);
ALTER TABLE public.planning_sector_members ADD CONSTRAINT planning_sector_members_pkey PRIMARY KEY (id);
ALTER TABLE public.planning_visibility ADD CONSTRAINT planning_visibility_pkey PRIMARY KEY (id);
ALTER TABLE public.pointage_sites ADD CONSTRAINT pointage_sites_pkey PRIMARY KEY (id);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE public.schedules ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);
ALTER TABLE public.sensitive_access_log ADD CONSTRAINT sensitive_access_log_pkey PRIMARY KEY (id);
ALTER TABLE public.server_secrets ADD CONSTRAINT server_secrets_pkey PRIMARY KEY (key);
ALTER TABLE public.timeclock ADD CONSTRAINT timeclock_pkey PRIMARY KEY (id);
ALTER TABLE public.timeclock_alerts ADD CONSTRAINT timeclock_alerts_pkey PRIMARY KEY (schedule_id, kind);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.week_templates ADD CONSTRAINT week_templates_pkey PRIMARY KEY (id);
ALTER TABLE public.work_declaration_history ADD CONSTRAINT work_declaration_history_pkey PRIMARY KEY (id);
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_pkey PRIMARY KEY (id);
ALTER TABLE public.access_links ADD CONSTRAINT access_links_token_key UNIQUE (token);
ALTER TABLE public.employees ADD CONSTRAINT employees_email_key UNIQUE (email);
ALTER TABLE public.modulation_counter ADD CONSTRAINT modulation_counter_employee_id_period_start_key UNIQUE (employee_id, period_start);
ALTER TABLE public.onboarding_invitations ADD CONSTRAINT onboarding_invitations_code_key UNIQUE (code);
ALTER TABLE public.onboarding_responses ADD CONSTRAINT onboarding_responses_employee_id_field_id_key UNIQUE (employee_id, field_id);
ALTER TABLE public.planning_preferences ADD CONSTRAINT planning_preferences_service_key UNIQUE (service);
ALTER TABLE public.planning_sector_members ADD CONSTRAINT planning_sector_members_service_employee_id_key UNIQUE (service, employee_id);
ALTER TABLE public.planning_visibility ADD CONSTRAINT planning_visibility_employee_id_service_week_start_key UNIQUE (employee_id, service, week_start);
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);
ALTER TABLE public.schedules ADD CONSTRAINT no_overlap UNIQUE (employee_id, work_date, start_time);
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_schedule_id_key UNIQUE (schedule_id);
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_check CHECK ((end_date >= start_date));
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_status_check CHECK ((status = ANY (ARRAY['en_attente'::text, 'acceptee'::text, 'refusee'::text, 'annulee'::text])));
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_type_check CHECK ((type = ANY (ARRAY['conge_paye'::text, 'repos'::text, 'indisponibilite'::text, 'maladie'::text, 'sans_solde'::text, 'autre'::text])));
ALTER TABLE public.availabilities ADD CONSTRAINT availabilities_status_check CHECK ((status = ANY (ARRAY['dispo'::text, 'matin'::text, 'apres_midi'::text, 'indispo'::text])));
ALTER TABLE public.consignes ADD CONSTRAINT consignes_check CHECK (((weekday IS NULL) <> (day IS NULL)));
ALTER TABLE public.consignes ADD CONSTRAINT consignes_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7)));
ALTER TABLE public.data_backups ADD CONSTRAINT data_backups_kind_check CHECK ((kind = ANY (ARRAY['auto'::text, 'manuel'::text])));
ALTER TABLE public.documents ADD CONSTRAINT documents_type_check CHECK ((type = ANY (ARRAY['bulletin_paie'::text, 'contrat'::text, 'avenant'::text, 'attestation'::text, 'certificat'::text, 'autre'::text])));
ALTER TABLE public.employees ADD CONSTRAINT employees_civilite_check CHECK (((civilite IS NULL) OR (civilite = ANY (ARRAY['Madame'::text, 'Monsieur'::text]))));
ALTER TABLE public.employees ADD CONSTRAINT employees_coefficient_check CHECK (((coefficient IS NULL) OR ((coefficient >= 100) AND (coefficient <= 700))));
ALTER TABLE public.employees ADD CONSTRAINT employees_logement_pieces_check CHECK (((logement_pieces >= 1) AND (logement_pieces <= 10)));
ALTER TABLE public.employees ADD CONSTRAINT employees_salaire_horaire_check CHECK (((salaire_horaire IS NULL) OR (salaire_horaire > (0)::numeric)));
ALTER TABLE public.employees ADD CONSTRAINT employees_service_check CHECK ((service = ANY (ARRAY['Accueil'::text, 'Housekeeping'::text, 'Technique'::text, 'Restauration'::text, 'Animation'::text, 'Managers'::text, 'Non defini'::text])));
ALTER TABLE public.mandatory_doc_signatures ADD CONSTRAINT mandatory_doc_signatures_method_check CHECK ((method = ANY (ARRAY['en_ligne'::text, 'papier'::text])));
ALTER TABLE public.mandatory_docs ADD CONSTRAINT mandatory_docs_check CHECK ((((kind = 'fichier'::text) AND (file_path IS NOT NULL)) OR ((kind = 'video'::text) AND (video_url IS NOT NULL))));
ALTER TABLE public.mandatory_docs ADD CONSTRAINT mandatory_docs_kind_check CHECK ((kind = ANY (ARRAY['fichier'::text, 'video'::text])));
ALTER TABLE public.mandatory_docs ADD CONSTRAINT mandatory_docs_renewal_check CHECK ((renewal = ANY (ARRAY['embauche'::text, 'annuel'::text])));
ALTER TABLE public.onboarding_fields ADD CONSTRAINT onboarding_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'email'::text, 'tel'::text, 'date'::text, 'file'::text, 'select'::text, 'multiselect'::text, 'signature'::text])));
ALTER TABLE public.payroll_months ADD CONSTRAINT payroll_months_month_check CHECK ((month ~ '^\d{4}-\d{2}$'::text));
ALTER TABLE public.payroll_months ADD CONSTRAINT payroll_months_overtime_banked_check CHECK ((overtime_banked >= (0)::numeric));
ALTER TABLE public.payroll_months ADD CONSTRAINT payroll_months_overtime_paid_check CHECK ((overtime_paid >= (0)::numeric));
ALTER TABLE public.schedules ADD CONSTRAINT schedules_shift_type_check CHECK ((shift_type = ANY (ARRAY['matin'::text, 'apres_midi'::text, 'journee'::text, 'soir'::text, 'custom'::text, 'off'::text, 'repos'::text, 'recup'::text])));
ALTER TABLE public.timeclock ADD CONSTRAINT timeclock_action_check CHECK ((action = ANY (ARRAY['in'::text, 'out'::text])));
ALTER TABLE public.timeclock_alerts ADD CONSTRAINT timeclock_alerts_kind_check CHECK ((kind = ANY (ARRAY['arrivee'::text, 'depart'::text])));
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'salarie'::text])));
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_break_minutes_check CHECK (((break_minutes >= 0) AND (break_minutes <= 600)));
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_check CHECK (((status = 'non_travaille'::text) OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL))));
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_status_check CHECK ((status = ANY (ARRAY['conforme'::text, 'modifie'::text, 'non_travaille'::text, 'auto'::text])));
ALTER TABLE public.absence_requests ADD CONSTRAINT absence_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.access_links ADD CONSTRAINT access_links_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.availabilities ADD CONSTRAINT availabilities_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);
ALTER TABLE public.employees ADD CONSTRAINT employees_contrat_signe_doc_fkey FOREIGN KEY (contrat_signe_doc) REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE public.mandatory_doc_signatures ADD CONSTRAINT mandatory_doc_signatures_doc_id_fkey FOREIGN KEY (doc_id) REFERENCES mandatory_docs(id) ON DELETE CASCADE;
ALTER TABLE public.mandatory_doc_signatures ADD CONSTRAINT mandatory_doc_signatures_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.modulation_counter ADD CONSTRAINT modulation_counter_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_fields ADD CONSTRAINT onboarding_fields_show_if_field_id_fkey FOREIGN KEY (show_if_field_id) REFERENCES onboarding_fields(id) ON DELETE SET NULL;
ALTER TABLE public.onboarding_responses ADD CONSTRAINT onboarding_responses_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.onboarding_responses ADD CONSTRAINT onboarding_responses_field_id_fkey FOREIGN KEY (field_id) REFERENCES onboarding_fields(id);
ALTER TABLE public.payroll_months ADD CONSTRAINT payroll_months_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.personnel_register ADD CONSTRAINT personnel_register_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE public.planning_sector_members ADD CONSTRAINT planning_sector_members_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.planning_visibility ADD CONSTRAINT planning_visibility_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.schedules ADD CONSTRAINT schedules_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.timeclock ADD CONSTRAINT timeclock_declaration_id_fkey FOREIGN KEY (declaration_id) REFERENCES work_declarations(id) ON DELETE CASCADE;
ALTER TABLE public.timeclock ADD CONSTRAINT timeclock_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.timeclock ADD CONSTRAINT timeclock_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id);
ALTER TABLE public.timeclock_alerts ADD CONSTRAINT timeclock_alerts_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id);
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.work_declaration_history ADD CONSTRAINT work_declaration_history_declaration_id_fkey FOREIGN KEY (declaration_id) REFERENCES work_declarations(id) ON DELETE CASCADE;
ALTER TABLE public.work_declaration_history ADD CONSTRAINT work_declaration_history_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE;
ALTER TABLE public.work_declarations ADD CONSTRAINT work_declarations_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE;

-- ===== Index =====
CREATE INDEX absence_requests_closure ON public.absence_requests USING btree (closure_id) WHERE (closure_id IS NOT NULL);
CREATE INDEX absence_requests_dates_idx ON public.absence_requests USING btree (start_date, end_date);
CREATE INDEX consignes_day ON public.consignes USING btree (day) WHERE (day IS NOT NULL);
CREATE INDEX mandatory_doc_signatures_doc_emp ON public.mandatory_doc_signatures USING btree (doc_id, employee_id, signed_at DESC);
CREATE INDEX personnel_register_emp ON public.personnel_register USING btree (employee_id, entree DESC);
CREATE INDEX push_subscriptions_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX work_declaration_history_decl ON public.work_declaration_history USING btree (declaration_id, declared_at);
CREATE INDEX work_declarations_emp_date ON public.work_declarations USING btree (employee_id, work_date);

-- ===== Fonctions =====
CREATE OR REPLACE FUNCTION public.absence_notification_data(p_id uuid)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN session_user = 'planning_app' OR public.is_manager() THEN (
    SELECT json_build_object(
      'id', a.id, 'employee_id', a.employee_id, 'type', a.type, 'start_date', a.start_date, 'end_date', a.end_date,
      'original_start_date', a.original_start_date, 'original_end_date', a.original_end_date,
      'comment', a.comment, 'status', a.status, 'manager_comment', a.manager_comment,
      'first_name', e.first_name, 'last_name', e.last_name, 'email', e.email,
      'manager_emails', (SELECT COALESCE(json_agg(DISTINCT m.email), '[]'::json)
                           FROM public.user_profiles p JOIN public.employees m ON m.id = p.employee_id
                          WHERE p.role IN ('admin','manager') AND m.email IS NOT NULL))
    FROM public.absence_requests a JOIN public.employees e ON e.id = a.employee_id
    WHERE a.id = p_id)
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.auto_confirm_declarations()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_since date; n integer;
BEGIN
  IF NOT (session_user = 'planning_app' OR public.is_manager()) THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  IF public.timeclock_enabled() THEN RETURN 0; END IF;
  SELECT NULLIF(value->>'declaratif_depuis', '')::date INTO v_since FROM public.app_settings WHERE key = 'pointeuse';
  IF v_since IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.work_declarations (schedule_id, employee_id, work_date, status, start_time, end_time, break_minutes, comment)
  SELECT s.id, s.employee_id, s.work_date, 'auto', s.start_time, s.end_time, s.break_minutes, 'Non valide par le salarie : horaires prevus retenus'
    FROM public.schedules s
   WHERE s.shift_type NOT IN ('repos','recup','off')
     AND s.work_date >= v_since
     AND now() >= public.declaration_lock_at(s.work_date)
     AND NOT EXISTS (SELECT 1 FROM public.work_declarations w WHERE w.schedule_id = s.id)
     AND NOT EXISTS (SELECT 1 FROM public.absence_requests a WHERE a.employee_id = s.employee_id AND a.status = 'acceptee'
                       AND s.work_date BETWEEN a.start_date AND a.end_date)
     AND NOT EXISTS (SELECT 1 FROM public.timeclock t WHERE t.employee_id = s.employee_id AND t.declaration_id IS NULL
                       AND (t.scanned_at AT TIME ZONE 'Europe/Paris')::date = s.work_date)
  ON CONFLICT (schedule_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION public.can_claim_employee(p_email text, p_active boolean)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND public.my_employee_id() IS NULL AND p_active = false AND lower(p_email) = lower(auth.jwt() ->> 'email');
$function$
;

CREATE OR REPLACE FUNCTION public.can_reveal()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_manager() AND (public.has_perm('dossiers_rh') OR public.has_perm('contrats') OR public.has_perm('paie'));
$function$
;

CREATE OR REPLACE FUNCTION public.check_access_link(p_token text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT json_build_object('valid', true, 'first_name', e.first_name)
       FROM public.access_links l JOIN public.employees e ON e.id = l.employee_id
      WHERE l.token = p_token AND l.used_at IS NULL AND l.expires_at > now()
        AND NOT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.employee_id = l.employee_id)),
    json_build_object('valid', false));
$function$
;

CREATE OR REPLACE FUNCTION public.check_cp_blackout()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p jsonb;
BEGIN
  IF auth.uid() IS NULL OR NEW.type <> 'conge_paye' OR public.is_manager() OR session_user = 'planning_app' THEN RETURN NEW; END IF;
  FOR p IN SELECT jsonb_array_elements(CASE WHEN jsonb_typeof(value) = 'array' THEN value ELSE '[]'::jsonb END)
             FROM public.app_settings WHERE key = 'cp_blackout' LOOP
    IF NULLIF(p->>'start','') IS NOT NULL AND NULLIF(p->>'end','') IS NOT NULL
       AND NEW.start_date <= (p->>'end')::date AND (p->>'start')::date <= NEW.end_date THEN
      RAISE EXCEPTION 'Pas de conges payes possibles du % au %', to_char((p->>'start')::date,'DD/MM/YYYY'),
        to_char((p->>'end')::date,'DD/MM/YYYY') || CASE WHEN COALESCE(p->>'label','') <> '' THEN ' (' || (p->>'label') || ')' ELSE '' END;
    END IF;
  END LOOP;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.check_invitation_code(p_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.onboarding_invitations WHERE code = upper(trim(p_code)) AND is_active = true);
$function$
;

CREATE OR REPLACE FUNCTION public.claim_access_link(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.access_links;
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt() ->> 'email');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non connecte'; END IF;
  SELECT * INTO v_link FROM public.access_links WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR v_link.used_at IS NOT NULL OR v_link.expires_at <= now() THEN
    RAISE EXCEPTION 'Lien invalide ou expire. Demandez un nouveau lien a votre responsable.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE employee_id = v_link.employee_id) THEN
    RAISE EXCEPTION 'Ce salarie a deja un acces a l''application.';
  END IF;
  IF (SELECT employee_id FROM public.user_profiles WHERE id = v_uid) IS NOT NULL THEN
    RAISE EXCEPTION 'Ce compte est deja rattache a un salarie.';
  END IF;
  UPDATE public.user_profiles SET employee_id = v_link.employee_id, role = 'salarie' WHERE id = v_uid;
  UPDATE public.employees SET email = v_email
   WHERE id = v_link.employee_id AND v_email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.employees o WHERE lower(o.email) = v_email AND o.id <> v_link.employee_id);
  UPDATE public.access_links SET used_at = now(), used_by = v_uid WHERE id = v_link.id;
  RETURN v_link.employee_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_access_link(p_employee_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_token text;
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Reserve aux managers'; END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE employee_id = p_employee_id) THEN
    RAISE EXCEPTION 'Ce salarie a deja un acces a l''application';
  END IF;
  UPDATE public.access_links SET expires_at = now() WHERE employee_id = p_employee_id AND used_at IS NULL AND expires_at > now();
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.access_links (employee_id, token) VALUES (p_employee_id, v_token);
  RETURN v_token;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_backup_snapshot(p_kind text DEFAULT 'manuel'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tables text[] := ARRAY['employees','schedules','timeclock','modulation_counter','absence_requests','payroll_months',
    'documents','onboarding_fields','onboarding_responses','onboarding_invitations','app_settings','user_profiles',
    'week_templates','access_links','planning_visibility','planning_preferences','planning_sector_members',
    'pointage_sites','timeclock_alerts','changelog','dev_notes','mandatory_docs','mandatory_doc_signatures','work_declarations','work_declaration_history','contract_templates','personnel_register','consignes','sensitive_access_log'];
  v_t text; v_rows json; v_data jsonb := '{}'::jsonb; v_counts jsonb := '{}'::jsonb; v_slot text; v_size integer;
BEGIN
  IF NOT (session_user = 'planning_app' OR (public.is_manager() AND public.has_perm('sauvegardes'))) THEN RAISE EXCEPTION 'Reserve aux managers'; END IF;
  IF p_kind NOT IN ('auto','manuel') THEN RAISE EXCEPTION 'Type de sauvegarde invalide'; END IF;
  FOREACH v_t IN ARRAY v_tables LOOP
    IF to_regclass('public.' || v_t) IS NOT NULL THEN
      EXECUTE format('SELECT coalesce(json_agg(t), ''[]''::json) FROM public.%I t', v_t) INTO v_rows;
      v_data := v_data || jsonb_build_object(v_t, v_rows);
      v_counts := v_counts || jsonb_build_object(v_t, json_array_length(v_rows));
    END IF;
  END LOOP;
  SELECT coalesce(json_agg(json_build_object('id', id, 'email', email, 'created_at', created_at)), '[]'::json) INTO v_rows FROM auth.users;
  v_data := v_data || jsonb_build_object('auth_users', v_rows, '_structure_sql', public.export_schema_sql());
  v_counts := v_counts || jsonb_build_object('auth_users', json_array_length(v_rows));

  IF p_kind = 'auto' THEN
    v_slot := 'auto-' || to_char(now() AT TIME ZONE 'Europe/Paris', 'DD');
  ELSIF (SELECT count(*) FROM public.data_backups WHERE kind = 'manuel') >= 10 THEN
    -- 10 sauvegardes manuelles deja presentes : on remplace la plus ancienne
    SELECT slot INTO v_slot FROM public.data_backups WHERE kind = 'manuel' ORDER BY created_at LIMIT 1;
  ELSE
    v_slot := 'manuel-' || to_char(clock_timestamp() AT TIME ZONE 'Europe/Paris', 'YYYYMMDD-HH24MISS');
  END IF;
  v_size := octet_length(v_data::text);
  INSERT INTO public.data_backups (slot, kind, created_at, created_by, size_bytes, row_counts, data)
  VALUES (v_slot, p_kind, clock_timestamp(), auth.uid(), v_size, v_counts, v_data)
  ON CONFLICT (slot) DO UPDATE SET created_at = EXCLUDED.created_at, created_by = EXCLUDED.created_by,
    size_bytes = EXCLUDED.size_bytes, row_counts = EXCLUDED.row_counts, data = EXCLUDED.data;
  RETURN json_build_object('slot', v_slot, 'size_bytes', v_size, 'row_counts', v_counts);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_user_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_profiles (id, role)
  VALUES (NEW.id, 'salarie')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.declaration_lock_at(p_date date)
 RETURNS timestamp with time zone
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ((date_trunc('week', p_date::timestamp) + interval '7 days 12 hours') AT TIME ZONE 'Europe/Paris');
$function$
;

CREATE OR REPLACE FUNCTION public.declare_work(p_schedule_id uuid, p_status text, p_start time without time zone DEFAULT NULL::time without time zone, p_end time without time zone DEFAULT NULL::time without time zone, p_break integer DEFAULT NULL::integer, p_comment text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.schedules; v_mgr boolean := public.is_manager(); b record; v_id uuid;
BEGIN
  SELECT * INTO s FROM public.schedules WHERE id = p_schedule_id;
  IF NOT FOUND OR s.shift_type IN ('repos','recup','off') THEN RAISE EXCEPTION 'Creneau introuvable'; END IF;
  IF NOT v_mgr THEN
    IF s.employee_id IS DISTINCT FROM public.my_employee_id() THEN RAISE EXCEPTION 'Acces refuse'; END IF;
    IF public.timeclock_enabled() THEN RAISE EXCEPTION 'La validation des horaires n''est pas active (pointeuse en service)'; END IF;
    IF now() >= public.declaration_lock_at(s.work_date) THEN RAISE EXCEPTION 'Semaine cloturee : demandez la correction a votre responsable'; END IF;
    SELECT * INTO b FROM public.shift_bounds(s.work_date, s.start_time, s.end_time);
    IF now() < b.ends_at - interval '30 minutes' THEN RAISE EXCEPTION 'Ce creneau n''est pas encore termine'; END IF;
  END IF;
  IF p_status NOT IN ('conforme','modifie','non_travaille') THEN RAISE EXCEPTION 'Reponse invalide'; END IF;
  IF p_status = 'modifie' AND (p_start IS NULL OR p_end IS NULL OR p_start = p_end) THEN RAISE EXCEPTION 'Indiquez les heures d''arrivee et de depart'; END IF;

  INSERT INTO public.work_declarations AS w (schedule_id, employee_id, work_date, status, start_time, end_time, break_minutes, comment, declared_at, declared_by, by_manager)
  VALUES (s.id, s.employee_id, s.work_date, p_status,
          CASE p_status WHEN 'conforme' THEN s.start_time WHEN 'modifie' THEN p_start END,
          CASE p_status WHEN 'conforme' THEN s.end_time WHEN 'modifie' THEN p_end END,
          CASE p_status WHEN 'conforme' THEN s.break_minutes WHEN 'modifie' THEN GREATEST(0, COALESCE(p_break, s.break_minutes)) ELSE 0 END,
          NULLIF(trim(p_comment), ''), now(), auth.uid(), v_mgr)
  ON CONFLICT (schedule_id) DO UPDATE SET status = EXCLUDED.status, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
    break_minutes = EXCLUDED.break_minutes, comment = EXCLUDED.comment, declared_at = now(), declared_by = auth.uid(), by_manager = v_mgr
  RETURNING w.id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.delete_employee(p_employee_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_files text[];
BEGIN
  IF NOT public.is_manager() THEN RAISE EXCEPTION 'Reserve aux managers'; END IF;
  IF p_employee_id = public.my_employee_id() THEN RAISE EXCEPTION 'Vous ne pouvez pas supprimer votre propre fiche'; END IF;
  IF EXISTS (SELECT 1 FROM public.timeclock WHERE employee_id = p_employee_id) THEN
    RAISE EXCEPTION 'Ce salarie a des pointages enregistres : renseignez plutot une date de fin de contrat.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_profiles WHERE employee_id = p_employee_id AND role IN ('admin','manager')) THEN
    RAISE EXCEPTION 'Cette fiche est liee a un compte manager : suppression impossible.';
  END IF;
  SELECT COALESCE(array_agg(file_path), '{}') INTO v_files FROM public.documents WHERE employee_id = p_employee_id;
  DELETE FROM auth.users WHERE id IN (SELECT id FROM public.user_profiles WHERE employee_id = p_employee_id);
  DELETE FROM public.employees WHERE id = p_employee_id;
  RETURN v_files;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.push_subscriptions WHERE endpoint = p_endpoint AND user_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.docs_access_candidates()
 RETURNS TABLE(id uuid, first_name text, last_name text, email text, contract_end_date date, access_end date, today date, reminder_due boolean, closed_due boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.first_name, e.last_name, e.email, e.contract_end_date,
         (e.contract_end_date + INTERVAL '3 months')::date,
         (now() AT TIME ZONE 'Europe/Paris')::date,
         e.docs_reminder_sent_for IS DISTINCT FROM e.contract_end_date,
         e.docs_closed_sent_for IS DISTINCT FROM e.contract_end_date
  FROM public.employees e
  WHERE session_user = 'planning_app'
    AND e.contract_end_date IS NOT NULL
    AND e.email IS NOT NULL AND e.email NOT LIKE '%@temp.fr'
    AND EXISTS (SELECT 1 FROM public.documents d WHERE d.employee_id = e.id);
$function$
;

CREATE OR REPLACE FUNCTION public.employees_last_sign_in()
 RETURNS TABLE(employee_id uuid, last_sign_in_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (session_user = 'planning_app' OR public.is_manager()) THEN RAISE EXCEPTION 'Reserve aux managers'; END IF;
  RETURN QUERY
    SELECT p.employee_id, max(GREATEST(u.last_sign_in_at, p.last_seen_at))
      FROM public.user_profiles p JOIN auth.users u ON u.id = p.id
     WHERE p.employee_id IS NOT NULL
     GROUP BY p.employee_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.encrypt_employee_nss()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.nss IS NULL OR btrim(NEW.nss) = '' THEN NEW.nss_enc := NULL; NEW.nss := NULL;
  ELSIF NEW.nss NOT LIKE '•%' THEN
    NEW.nss_enc := extensions.pgp_sym_encrypt(NEW.nss, public.sensitive_key());
    NEW.nss := public.mask_sensitive(NEW.nss);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.encrypt_sensitive_response()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_sensitive_field(NEW.field_id) AND NEW.value IS NOT NULL AND NEW.value NOT LIKE '•%' THEN
    NEW.value_enc := extensions.pgp_sym_encrypt(NEW.value, public.sensitive_key());
    NEW.value := public.mask_sensitive(NEW.value);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.export_schema_sql()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF NOT (session_user = 'planning_app' OR public.is_manager()) THEN RAISE EXCEPTION 'Reserve aux managers'; END IF;
  WITH
  tbl AS (SELECT c.oid, c.relname FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'),
  cols AS (
    SELECT t.relname, string_agg('  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
             || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
             || coalesce(' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid), ''), E',\n' ORDER BY a.attnum) AS body
    FROM tbl t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
    GROUP BY t.relname),
  s_tables AS (SELECT string_agg(format(E'CREATE TABLE IF NOT EXISTS public.%I (\n%s\n);', relname, body), E'\n\n' ORDER BY relname) AS s FROM cols),
  s_cons AS (SELECT string_agg(format('ALTER TABLE public.%I ADD CONSTRAINT %I %s;', t.relname, co.conname, pg_get_constraintdef(co.oid)), E'\n'
               ORDER BY CASE co.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 ELSE 4 END, t.relname, co.conname) AS s
             FROM pg_constraint co JOIN tbl t ON t.oid=co.conrelid WHERE co.contype IN ('p','u','c','f')),
  s_idx AS (SELECT string_agg(indexdef || ';', E'\n' ORDER BY indexname) AS s FROM pg_indexes i
            WHERE schemaname='public' AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conname=i.indexname)),
  s_fn AS (SELECT string_agg(pg_get_functiondef(p.oid) || ';', E'\n\n' ORDER BY p.proname) AS s FROM pg_proc p
           WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'),
  s_trg AS (SELECT string_agg(pg_get_triggerdef(tg.oid) || ';', E'\n' ORDER BY tg.tgname) AS s FROM pg_trigger tg
            JOIN pg_class c ON c.oid=tg.tgrelid WHERE NOT tg.tgisinternal
              AND (c.relnamespace='public'::regnamespace OR (c.relnamespace='auth'::regnamespace AND c.relname='users'))),
  s_rls AS (SELECT string_agg(format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', c.relname), E'\n' ORDER BY c.relname) AS s
            FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='r' AND c.relrowsecurity),
  s_pol AS (SELECT string_agg(format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;', policyname, schemaname, tablename, permissive, cmd,
              array_to_string(roles, ', '), coalesce(' USING (' || qual || ')', ''), coalesce(' WITH CHECK (' || with_check || ')', '')),
              E'\n' ORDER BY schemaname, tablename, policyname) AS s
            FROM pg_policies WHERE schemaname IN ('public','storage')),
  s_tgrant AS (SELECT string_agg(format('GRANT %s ON public.%I TO planning_app;', privs, table_name), E'\n' ORDER BY table_name) AS s
               FROM (SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs FROM information_schema.role_table_grants
                     WHERE grantee='planning_app' AND table_schema='public' GROUP BY table_name) g),
  s_fgrant AS (SELECT string_agg(stmt, E'\n' ORDER BY ord, stmt) AS s FROM (
     SELECT 1 AS ord, format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated;', p.proname, pg_get_function_identity_arguments(p.oid)) AS stmt
     FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'
     UNION ALL
     SELECT 2, format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO %s;', p.proname, pg_get_function_identity_arguments(p.oid),
              CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END)
     FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
     WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND x.privilege_type='EXECUTE'
       AND (x.grantee=0 OR pg_get_userbyid(x.grantee) IN ('anon','authenticated','planning_app','service_role'))) f)
  SELECT concat_ws(E'\n\n',
    '-- Structure Planning HPA, generee le ' || to_char(now() AT TIME ZONE 'Europe/Paris', 'DD/MM/YYYY HH24:MI') || E'\n'
      || E'-- A executer sur un projet Supabase NEUF (SQL Editor), avant la restauration des donnees.\n'
      || E'-- Apres execution : definir le mot de passe du role planning_app (ALTER ROLE planning_app PASSWORD ...)\n'
      || '-- et mettre a jour DATABASE_URL du backend.',
    E'SET check_function_bodies = off;\nCREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;\n'
      || E'DO $r$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ''planning_app'') THEN CREATE ROLE planning_app LOGIN; END IF; END $r$;\n'
      || 'GRANT USAGE ON SCHEMA public TO planning_app;',
    E'-- ===== Tables =====\n' || s_tables.s,
    E'-- ===== Contraintes =====\n' || s_cons.s,
    E'-- ===== Index =====\n' || coalesce(s_idx.s, ''),
    E'-- ===== Fonctions =====\n' || s_fn.s,
    E'-- ===== Declencheurs =====\n' || coalesce(s_trg.s, ''),
    E'-- ===== Securite par ligne =====\n' || s_rls.s,
    E'-- ===== Stockage des documents =====\n'
      || (SELECT string_agg(format('INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES (%L, %L, %L, %s) ON CONFLICT (id) DO NOTHING;', b.id, b.name, b.public, coalesce(b.file_size_limit::text, 'NULL')), E'\n' ORDER BY b.id) FROM storage.buckets b),
    E'-- ===== Regles d''acces =====\n' || s_pol.s,
    E'-- ===== Droits =====\n' || coalesce(s_tgrant.s, '') || E'\n' || s_fgrant.s)
  INTO v
  FROM s_tables, s_cons, s_idx, s_fn, s_trg, s_rls, s_pol, s_tgrant, s_fgrant;
  RETURN v;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_encryption_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  INSERT INTO public.sensitive_access_log (user_id, field, reason) VALUES (auth.uid(), 'cle', 'Telechargement de la cle de secours');
  RETURN public.sensitive_key();
END $function$
;

CREATE OR REPLACE FUNCTION public.has_perm(p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.has_perm_user(auth.uid(), p_perm);
$function$
;

CREATE OR REPLACE FUNCTION public.has_perm_user(p_user uuid, p_perm text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((
    SELECT CASE p.role
      WHEN 'admin' THEN true
      WHEN 'manager' THEN p_perm <> 'roles' AND COALESCE((s.value -> 'manager' ->> p_perm)::boolean, true)
      WHEN 'salarie' THEN p_perm = ANY (ARRAY['pointeuse','absences_demande','mes_documents','documents_communs','mes_heures','mes_horaires'])
                          AND COALESCE((s.value -> 'salarie' ->> p_perm)::boolean, true)
      ELSE false END
    FROM public.user_profiles p LEFT JOIN public.app_settings s ON s.key = 'roles_droits'
    WHERE p.id = p_user), false);
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.is_manager()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role IN ('admin','manager'));
$function$
;

CREATE OR REPLACE FUNCTION public.is_sensitive_field(p_field uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.onboarding_fields WHERE id = p_field AND label IN ('Numero de securite sociale', 'IBAN'));
$function$
;

CREATE OR REPLACE FUNCTION public.keep_declaration_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Seul un vrai changement (reponse, heures ou pause) cree une version ; un simple commentaire ne compte pas
  IF (OLD.status, OLD.start_time, OLD.end_time, OLD.break_minutes) IS DISTINCT FROM (NEW.status, NEW.start_time, NEW.end_time, NEW.break_minutes) THEN
    INSERT INTO public.work_declaration_history (declaration_id, employee_id, work_date, status, start_time, end_time, break_minutes, comment, declared_at, by_manager, replaced_by_manager)
    VALUES (OLD.id, OLD.employee_id, OLD.work_date, OLD.status, OLD.start_time, OLD.end_time, OLD.break_minutes, OLD.comment, OLD.declared_at, OLD.by_manager, NEW.by_manager);
    IF NOT NEW.by_manager AND OLD.status <> 'auto' THEN NEW.revisions := OLD.revisions + 1; END IF;
  ELSE
    NEW.revisions := OLD.revisions;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.list_accounts()
 RETURNS TABLE(user_id uuid, email text, role text, employee_id uuid, first_name text, last_name text, last_seen timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  RETURN QUERY
    SELECT p.id, u.email::text, p.role, p.employee_id, e.first_name, e.last_name, GREATEST(u.last_sign_in_at, p.last_seen_at)
      FROM public.user_profiles p JOIN auth.users u ON u.id = p.id LEFT JOIN public.employees e ON e.id = p.employee_id
     ORDER BY CASE p.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, e.last_name NULLS LAST, u.email;
END $function$
;

CREATE OR REPLACE FUNCTION public.mark_timeclock_alert(p_schedule_id uuid, p_kind text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.timeclock_alerts (schedule_id, kind)
  SELECT p_schedule_id, p_kind WHERE session_user = 'planning_app'
  ON CONFLICT DO NOTHING;
$function$
;

CREATE OR REPLACE FUNCTION public.mask_sensitive(v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN v IS NULL OR btrim(v) = '' THEN v ELSE '•••• ' || right(regexp_replace(v, '[^0-9A-Za-z]', '', 'g'), 4) END;
$function$
;

CREATE OR REPLACE FUNCTION public.match_nss(p_candidates text[])
 RETURNS TABLE(candidate text, employee_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.is_manager() AND public.has_perm('paie')) THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  INSERT INTO public.sensitive_access_log (user_id, field, reason) VALUES (auth.uid(), 'numero_secu', 'Reconnaissance des bulletins de paie');
  RETURN QUERY
    WITH clear AS (
      SELECT e.id, left(regexp_replace(extensions.pgp_sym_decrypt(e.nss_enc, public.sensitive_key()), '\D', '', 'g'), 13) AS n FROM public.employees e WHERE e.nss_enc IS NOT NULL
      UNION ALL
      SELECT o.employee_id, left(regexp_replace(extensions.pgp_sym_decrypt(o.value_enc, public.sensitive_key()), '\D', '', 'g'), 13)
        FROM public.onboarding_responses o JOIN public.onboarding_fields f ON f.id = o.field_id
       WHERE f.label = 'Numero de securite sociale' AND o.value_enc IS NOT NULL)
    SELECT DISTINCT c.n, c.id FROM clear c WHERE length(c.n) = 13 AND c.n = ANY (p_candidates);
END $function$
;

CREATE OR REPLACE FUNCTION public.my_documents_accessible()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT e.contract_end_date IS NULL OR current_date <= e.contract_end_date + interval '3 months'
                     FROM public.employees e WHERE e.id = public.my_employee_id()), false);
$function$
;

CREATE OR REPLACE FUNCTION public.my_employee_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT employee_id FROM public.user_profiles WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.pending_timeclock_alerts(p_delay integer)
 RETURNS TABLE(schedule_id uuid, kind text, employee_name text, work_date date, start_time time without time zone, end_time time without time zone, manager_emails json)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT sc.id, sc.employee_id, sc.work_date, sc.start_time, sc.end_time,
           e.first_name || ' ' || coalesce(e.last_name, '') AS employee_name,
           (sc.work_date + sc.start_time) AT TIME ZONE 'Europe/Paris' AS start_ts,
           (CASE WHEN sc.end_time <= sc.start_time THEN sc.work_date + 1 + sc.end_time ELSE sc.work_date + sc.end_time END) AT TIME ZONE 'Europe/Paris' AS end_ts
    FROM public.schedules sc JOIN public.employees e ON e.id = sc.employee_id
    WHERE session_user = 'planning_app'
      AND sc.is_published AND sc.shift_type NOT IN ('repos', 'recup', 'off') AND NOT e.is_temp
      AND sc.work_date BETWEEN (now() AT TIME ZONE 'Europe/Paris')::date - 1 AND (now() AT TIME ZONE 'Europe/Paris')::date
      AND NOT EXISTS (SELECT 1 FROM public.absence_requests a WHERE a.employee_id = sc.employee_id AND a.status = 'acceptee'
                      AND sc.work_date BETWEEN a.start_date AND a.end_date)
  ), c AS (
    SELECT s.*,
      EXISTS (SELECT 1 FROM public.timeclock t WHERE t.employee_id = s.employee_id AND t.action = 'in'
              AND t.scanned_at BETWEEN s.start_ts - interval '1 hour' AND s.end_ts) AS has_in,
      EXISTS (SELECT 1 FROM public.timeclock t WHERE t.employee_id = s.employee_id AND t.action = 'out'
              AND t.scanned_at BETWEEN s.start_ts AND s.end_ts + interval '3 hours') AS has_out
    FROM s
  ), alerts AS (
    SELECT c.*, 'arrivee'::text AS kind FROM c
     WHERE NOT c.has_in AND now() > c.start_ts + make_interval(mins => p_delay) AND now() < c.end_ts + interval '6 hours'
    UNION ALL
    SELECT c.*, 'depart'::text FROM c
     WHERE c.has_in AND NOT c.has_out AND now() > c.end_ts + make_interval(mins => p_delay) AND now() < c.end_ts + interval '12 hours'
  )
  SELECT al.id, al.kind, al.employee_name, al.work_date, al.start_time, al.end_time,
    (SELECT coalesce(json_agg(DISTINCT m.email), '[]'::json) FROM public.user_profiles p JOIN public.employees m ON m.id = p.employee_id
      WHERE p.role IN ('admin','manager') AND m.email IS NOT NULL)
  FROM alerts al
  WHERE NOT EXISTS (SELECT 1 FROM public.timeclock_alerts x WHERE x.schedule_id = al.id AND x.kind = al.kind);
$function$
;

CREATE OR REPLACE FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET "TimeZone" TO 'Europe/Paris'
 SET search_path TO 'public'
AS $function$
DECLARE
  v_schedule RECORD;
  v_is_late BOOLEAN := false;
  v_late_minutes INTEGER := 0;
  v_scan RECORD;
  v_last_in RECORD;
  v_worked_minutes NUMERIC := 0;
BEGIN
  -- Récupère le créneau prévu du jour
  SELECT * INTO v_schedule
  FROM schedules
  WHERE employee_id = p_employee_id
    AND work_date = CURRENT_DATE
    AND is_published = true
  LIMIT 1;

  -- Calcul du retard si action = 'in'
  IF p_action = 'in' AND v_schedule IS NOT NULL THEN
    v_late_minutes := GREATEST(0, EXTRACT(EPOCH FROM (
      NOW()::time - v_schedule.start_time
    )) / 60)::INTEGER;
    v_is_late := v_late_minutes > 5;
  END IF;

  -- Enregistre le pointage
  INSERT INTO timeclock (employee_id, action, scanned_at, is_late, late_minutes, schedule_id)
  VALUES (p_employee_id, p_action, NOW(), v_is_late, v_late_minutes, v_schedule.id)
  RETURNING * INTO v_scan;

  -- Si c'est un départ, calcule les heures travaillées et met à jour la modulation
  IF p_action = 'out' THEN
    SELECT * INTO v_last_in
    FROM timeclock
    WHERE employee_id = p_employee_id
      AND action = 'in'
      AND scanned_at::date = CURRENT_DATE
    ORDER BY scanned_at DESC
    LIMIT 1;

    IF v_last_in IS NOT NULL THEN
      v_worked_minutes := EXTRACT(EPOCH FROM (NOW() - v_last_in.scanned_at)) / 60;

      -- Met à jour le compteur de modulation
      UPDATE modulation_counter
      SET worked_hours = worked_hours + (v_worked_minutes / 60),
          updated_at = NOW()
      WHERE employee_id = p_employee_id
        AND period_start <= CURRENT_DATE
        AND period_end >= CURRENT_DATE;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'scan_id', v_scan.id,
    'employee_id', p_employee_id,
    'action', p_action,
    'scanned_at', v_scan.scanned_at,
    'is_late', v_is_late,
    'late_minutes', v_late_minutes,
    'worked_minutes', v_worked_minutes,
    'schedule', CASE WHEN v_schedule IS NOT NULL THEN
      jsonb_build_object('start', v_schedule.start_time, 'end', v_schedule.end_time)
    ELSE NULL END
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_employee_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_manager() THEN
    NEW.id := OLD.id; NEW.email := OLD.email; NEW.role := OLD.role; NEW.service := OLD.service;
    NEW.services_secondaires := OLD.services_secondaires; NEW.contract_hours := OLD.contract_hours;
    NEW.contract_type := OLD.contract_type; NEW.hire_date := OLD.hire_date; NEW.is_active := OLD.is_active;
    NEW.is_temp := OLD.is_temp; NEW.sort_order := OLD.sort_order; NEW.contract_end_date := OLD.contract_end_date;
    NEW.emploi_repere := OLD.emploi_repere; NEW.categorie := OLD.categorie; NEW.coefficient := OLD.coefficient;
    NEW.salaire_horaire := OLD.salaire_horaire; NEW.periode_essai := OLD.periode_essai; NEW.taches := OLD.taches;
    NEW.logement := OLD.logement; NEW.logement_details := OLD.logement_details;
    NEW.contrat_genere_at := OLD.contrat_genere_at; NEW.contrat_signe_at := OLD.contrat_signe_at;
    NEW.contrat_signe_debut := OLD.contrat_signe_debut; NEW.contrat_signe_doc := OLD.contrat_signe_doc;
    NEW.logement_pieces := OLD.logement_pieces; NEW.caution_recue_at := OLD.caution_recue_at; NEW.nss_enc := OLD.nss_enc;
    NEW.cp_init_date := OLD.cp_init_date; NEW.cp_init_n1 := OLD.cp_init_n1; NEW.cp_init_n := OLD.cp_init_n;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_employee_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user = 'authenticated' AND NOT public.is_manager() THEN
    NEW.emploi_repere := NULL; NEW.categorie := NULL; NEW.coefficient := NULL; NEW.salaire_horaire := NULL;
    NEW.periode_essai := NULL; NEW.taches := NULL; NEW.logement := false; NEW.logement_details := NULL;
    NEW.contrat_genere_at := NULL; NEW.contrat_signe_at := NULL; NEW.contrat_signe_debut := NULL; NEW.contrat_signe_doc := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_roles_setting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END) = 'roles_droits' AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur modifie les roles et droits';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$
;

CREATE OR REPLACE FUNCTION public.protect_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur peut changer les roles';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.purge_departed_sensitive()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT (session_user = 'planning_app' OR public.is_admin()) THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  UPDATE public.onboarding_responses o SET value = NULL, value_enc = NULL
    FROM public.onboarding_fields f, public.employees e
   WHERE f.id = o.field_id AND f.label = 'IBAN' AND e.id = o.employee_id AND o.value_enc IS NOT NULL
     AND e.contract_end_date IS NOT NULL AND e.contract_end_date < (now() - interval '6 months')::date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$
;

CREATE OR REPLACE FUNCTION public.reveal_employee_nss(p_employee uuid, p_reason text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v text;
BEGIN
  IF NOT public.can_reveal() THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  SELECT extensions.pgp_sym_decrypt(nss_enc, public.sensitive_key()) INTO v FROM public.employees WHERE id = p_employee AND nss_enc IS NOT NULL;
  IF v IS NULL THEN
    SELECT extensions.pgp_sym_decrypt(o.value_enc, public.sensitive_key()) INTO v
      FROM public.onboarding_responses o JOIN public.onboarding_fields f ON f.id = o.field_id
     WHERE o.employee_id = p_employee AND f.label = 'Numero de securite sociale' AND o.value_enc IS NOT NULL LIMIT 1;
  END IF;
  INSERT INTO public.sensitive_access_log (user_id, employee_id, field, reason) VALUES (auth.uid(), p_employee, 'numero_secu', p_reason);
  RETURN v;
END $function$
;

CREATE OR REPLACE FUNCTION public.reveal_response(p_response uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v text; e uuid; lbl text;
BEGIN
  IF NOT public.can_reveal() THEN RAISE EXCEPTION 'Acces refuse'; END IF;
  SELECT extensions.pgp_sym_decrypt(o.value_enc, public.sensitive_key()), o.employee_id, f.label INTO v, e, lbl
    FROM public.onboarding_responses o JOIN public.onboarding_fields f ON f.id = o.field_id WHERE o.id = p_response;
  INSERT INTO public.sensitive_access_log (user_id, employee_id, field, reason) VALUES (auth.uid(), e, lbl, 'Dossier RH');
  RETURN v;
END $function$
;

CREATE OR REPLACE FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non connecte'; END IF;
  IF p_endpoint !~ '^https://' THEN RAISE EXCEPTION 'Abonnement invalide'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  ON CONFLICT (endpoint) DO UPDATE SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent, created_at = now();
END $function$
;

CREATE OR REPLACE FUNCTION public.sensitive_key()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT value FROM public.server_secrets WHERE key = 'cle_donnees_sensibles';
$function$
;

CREATE OR REPLACE FUNCTION public.set_user_role(p_user uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Reserve aux administrateurs'; END IF;
  IF p_role NOT IN ('admin', 'manager', 'salarie') THEN RAISE EXCEPTION 'Role invalide'; END IF;
  IF p_role <> 'admin' AND (SELECT role FROM public.user_profiles WHERE id = p_user) = 'admin'
     AND (SELECT count(*) FROM public.user_profiles WHERE role = 'admin') <= 1 THEN
    RAISE EXCEPTION 'Il doit rester au moins un administrateur';
  END IF;
  UPDATE public.user_profiles SET role = p_role WHERE id = p_user;
END $function$
;

CREATE OR REPLACE FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone)
 RETURNS record
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT (p_date + p_start) AT TIME ZONE 'Europe/Paris',
         (p_date + p_end + CASE WHEN p_end <= p_start THEN interval '1 day' ELSE interval '0' END) AT TIME ZONE 'Europe/Paris';
$function$
;

CREATE OR REPLACE FUNCTION public.stamp_doc_signature()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_doc public.mandatory_docs;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_doc FROM public.mandatory_docs WHERE id = NEW.doc_id;
  IF NOT FOUND OR NOT v_doc.is_active OR NOT v_doc.requires_signature THEN RAISE EXCEPTION 'Document introuvable ou archive'; END IF;
  IF public.is_manager() THEN
    -- Le manager enregistre une signature faite sur papier
    NEW.method := 'papier';
    NEW.recorded_by := auth.uid();
    NEW.user_id := NULL;
    NEW.signed_at := COALESCE(LEAST(NEW.signed_at, now()), now());
  ELSE
    IF NEW.employee_id IS DISTINCT FROM public.my_employee_id() THEN RAISE EXCEPTION 'Signature refusee'; END IF;
    NEW.method := 'en_ligne';
    NEW.user_id := auth.uid();
    NEW.recorded_by := NULL;
    NEW.signed_at := now();
  END IF;
  NEW.version := v_doc.version;
  NEW.signed_name := (SELECT first_name || ' ' || last_name FROM public.employees WHERE id = NEW.employee_id);
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_declaration_timeclock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old numeric := 0; v_new numeric := 0; b record; v_emp uuid; v_date date;
BEGIN
  -- Restauration de sauvegarde (connexion directe) : pointages et compteurs sont restaures tels quels
  IF auth.uid() IS NULL AND session_user <> 'planning_app' THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' AND OLD.status <> 'non_travaille' THEN
    SELECT * INTO b FROM public.shift_bounds(OLD.work_date, OLD.start_time, OLD.end_time);
    v_old := EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 60;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    DELETE FROM public.timeclock WHERE declaration_id = NEW.id;
    IF NEW.status <> 'non_travaille' THEN
      SELECT * INTO b FROM public.shift_bounds(NEW.work_date, NEW.start_time, NEW.end_time);
      v_new := EXTRACT(EPOCH FROM (b.ends_at - b.starts_at)) / 60;
      INSERT INTO public.timeclock (employee_id, action, scanned_at, is_late, late_minutes, device, declaration_id, note)
      VALUES (NEW.employee_id, 'in', b.starts_at, false, 0, 'declaratif', NEW.id, 'Horaires declares'),
             (NEW.employee_id, 'out', b.ends_at, false, 0, 'declaratif', NEW.id, 'Horaires declares');
    END IF;
  END IF;
  -- Meme regle que la pointeuse : temps de presence (arrivee -> depart) ajoute au compteur de la periode
  v_emp := COALESCE(NEW.employee_id, OLD.employee_id);
  v_date := COALESCE(NEW.work_date, OLD.work_date);
  IF v_new <> v_old THEN
    UPDATE public.modulation_counter SET worked_hours = worked_hours + (v_new - v_old) / 60, updated_at = now()
     WHERE employee_id = v_emp AND period_start <= v_date AND period_end >= v_date;
  END IF;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.sync_personnel_register()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE last public.personnel_register; r jsonb; v_sexe text;
BEGIN
  IF NOT NEW.is_active OR NEW.is_temp OR NEW.hire_date IS NULL THEN RETURN NEW; END IF;
  SELECT jsonb_object_agg(f.label, o.value) INTO r
    FROM public.onboarding_responses o JOIN public.onboarding_fields f ON f.id = o.field_id WHERE o.employee_id = NEW.id;
  r := COALESCE(r, '{}'::jsonb);
  v_sexe := CASE COALESCE(NEW.civilite, r->>'Civilite') WHEN 'Madame' THEN 'F' WHEN 'Monsieur' THEN 'M' END;
  SELECT * INTO last FROM public.personnel_register WHERE employee_id = NEW.id ORDER BY entree DESC LIMIT 1;
  IF last.id IS NULL OR (last.sortie IS NOT NULL AND NEW.hire_date > last.sortie) THEN
    INSERT INTO public.personnel_register (employee_id, nom, prenoms, entree) VALUES (NEW.id, upper(NEW.last_name), NEW.first_name, NEW.hire_date)
    RETURNING * INTO last;
  END IF;
  UPDATE public.personnel_register SET
    nom = upper(NEW.last_name), prenoms = NEW.first_name, sexe = COALESCE(v_sexe, sexe),
    nationalite = COALESCE(NULLIF(r->>'Nationalite', ''), nationalite),
    date_naissance = COALESCE(NEW.birth_date, CASE WHEN r->>'Date de naissance' ~ '^\d{4}-\d{2}-\d{2}$' THEN (r->>'Date de naissance')::date END, date_naissance),
    emploi = NEW.role,
    qualification = NULLIF(concat_ws(' - ', CASE WHEN NEW.categorie IS NOT NULL THEN 'Catégorie ' || NEW.categorie END, CASE WHEN NEW.coefficient IS NOT NULL THEN 'coefficient ' || NEW.coefficient END), ''),
    type_contrat = NEW.contract_type, heures = NEW.contract_hours, temps_partiel = COALESCE(NEW.contract_hours < 35, false),
    entree = NEW.hire_date, sortie = NEW.contract_end_date,
    titre_travail_type = COALESCE(NULLIF(r->>'Titre de sejour ou autorisation de travail (hors UE)', ''), titre_travail_type),
    titre_travail_numero = COALESCE(NULLIF(r->>'Numero du titre de sejour', ''), titre_travail_numero),
    updated_at = now()
  WHERE id = last.id;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.timeclock_enabled()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT (value->>'enabled')::boolean FROM public.app_settings WHERE key = 'pointeuse'), true);
$function$
;

CREATE OR REPLACE FUNCTION public.touch_last_seen()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.user_profiles SET last_seen_at = now()
   WHERE id = auth.uid() AND (last_seen_at IS NULL OR last_seen_at < now() - interval '5 minutes');
$function$
;

-- ===== Declencheurs =====
CREATE TRIGGER check_cp_blackout BEFORE INSERT ON public.absence_requests FOR EACH ROW EXECUTE FUNCTION check_cp_blackout();
CREATE TRIGGER encrypt_employee_nss BEFORE INSERT OR UPDATE OF nss ON public.employees FOR EACH ROW EXECUTE FUNCTION encrypt_employee_nss();
CREATE TRIGGER encrypt_sensitive_response BEFORE INSERT OR UPDATE OF value ON public.onboarding_responses FOR EACH ROW EXECUTE FUNCTION encrypt_sensitive_response();
CREATE TRIGGER keep_declaration_history BEFORE UPDATE ON public.work_declarations FOR EACH ROW EXECUTE FUNCTION keep_declaration_history();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION create_user_profile();
CREATE TRIGGER protect_employee_fields BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION protect_employee_fields();
CREATE TRIGGER protect_employee_insert BEFORE INSERT ON public.employees FOR EACH ROW EXECUTE FUNCTION protect_employee_insert();
CREATE TRIGGER protect_roles_setting BEFORE INSERT OR DELETE OR UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION protect_roles_setting();
CREATE TRIGGER protect_user_role BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION protect_user_role();
CREATE TRIGGER stamp_doc_signature BEFORE INSERT ON public.mandatory_doc_signatures FOR EACH ROW EXECUTE FUNCTION stamp_doc_signature();
CREATE TRIGGER sync_declaration_timeclock AFTER INSERT OR DELETE OR UPDATE ON public.work_declarations FOR EACH ROW EXECUTE FUNCTION sync_declaration_timeclock();
CREATE TRIGGER sync_personnel_register AFTER INSERT OR UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION sync_personnel_register();

-- ===== Securite par ligne =====
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_backups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dev_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandatory_doc_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mandatory_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modulation_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personnel_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_sector_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planning_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pointage_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sensitive_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeclock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timeclock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.week_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_declaration_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_declarations ENABLE ROW LEVEL SECURITY;

-- ===== Stockage des documents =====
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('documents-communs', 'documents-communs', 'f', 52428800) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('documents-rh', 'documents-rh', 'f', NULL) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public, file_size_limit) VALUES ('modeles-contrats', 'modeles-contrats', 'f', 10485760) ON CONFLICT (id) DO NOTHING;

-- ===== Regles d'acces =====
CREATE POLICY "Acces lecture absences" ON public.absence_requests AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager" ON public.absence_requests AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK ((is_manager() AND (has_perm('absences'::text) OR has_perm('parametrage'::text))));
CREATE POLICY "Salarie annule sa demande" ON public.absence_requests AS PERMISSIVE FOR UPDATE TO authenticated USING (((employee_id = my_employee_id()) AND (status = 'en_attente'::text))) WITH CHECK (((employee_id = my_employee_id()) AND (status = 'annulee'::text)));
CREATE POLICY "Salarie demande une absence" ON public.absence_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((employee_id = my_employee_id()) AND (status = 'en_attente'::text) AND (decided_by IS NULL) AND (manager_comment IS NULL) AND (original_start_date IS NULL) AND (original_end_date IS NULL) AND (closure_id IS NULL) AND has_perm('absences_demande'::text)));
CREATE POLICY "Salarie voit ses absences" ON public.absence_requests AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Manager" ON public.access_links AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces settings" ON public.app_settings AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Lecture connectes" ON public.app_settings AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager" ON public.app_settings AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Manager" ON public.availabilities AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Salarie declare ses disponibilites" ON public.availabilities AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((employee_id = my_employee_id()));
CREATE POLICY "Salarie modifie ses disponibilites" ON public.availabilities AS PERMISSIVE FOR UPDATE TO authenticated USING ((employee_id = my_employee_id())) WITH CHECK ((employee_id = my_employee_id()));
CREATE POLICY "Salarie voit ses disponibilites" ON public.availabilities AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Acces changelog" ON public.changelog AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Lecture connectes" ON public.changelog AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager" ON public.changelog AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Lecture connectes" ON public.consignes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager" ON public.consignes AS PERMISSIVE FOR ALL TO authenticated USING ((is_manager() AND has_perm('planning_modifier'::text))) WITH CHECK ((is_manager() AND has_perm('planning_modifier'::text)));
CREATE POLICY "Manager" ON public.contract_templates AS PERMISSIVE FOR ALL TO authenticated USING ((is_manager() AND has_perm('contrats'::text))) WITH CHECK ((is_manager() AND has_perm('contrats'::text)));
CREATE POLICY "Manager lecture" ON public.data_backups AS PERMISSIVE FOR SELECT TO authenticated USING ((is_manager() AND has_perm('sauvegardes'::text)));
CREATE POLICY "Acces dev notes" ON public.dev_notes AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Lecture connectes" ON public.dev_notes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager" ON public.dev_notes AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Manager peut inserer des documents" ON public.documents AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['manager'::text, 'admin'::text]))))));
CREATE POLICY "Manager peut supprimer des documents" ON public.documents AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['manager'::text, 'admin'::text]))))));
CREATE POLICY "Manager voit tous les documents" ON public.documents AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM user_profiles
  WHERE ((user_profiles.id = auth.uid()) AND (user_profiles.role = ANY (ARRAY['manager'::text, 'admin'::text]))))));
CREATE POLICY "Salarie peut deposer ses documents" ON public.documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((employee_id = ( SELECT user_profiles.employee_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))));
CREATE POLICY "Salarie voit ses documents" ON public.documents AS PERMISSIVE FOR SELECT TO public USING (((employee_id = my_employee_id()) AND my_documents_accessible()));
CREATE POLICY "Acces employees" ON public.employees AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.employees AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Nouvel arrivant cree sa fiche" ON public.employees AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (can_claim_employee(email, is_active));
CREATE POLICY "Salarie modifie sa fiche" ON public.employees AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = my_employee_id()) OR can_claim_employee(email, is_active))) WITH CHECK (((id = my_employee_id()) OR can_claim_employee(email, is_active)));
CREATE POLICY "Salarie voit sa fiche" ON public.employees AS PERMISSIVE FOR SELECT TO authenticated USING (((id = my_employee_id()) OR can_claim_employee(email, is_active)));
CREATE POLICY "Acces signatures" ON public.mandatory_doc_signatures AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager enregistre signature papier" ON public.mandatory_doc_signatures AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (is_manager());
CREATE POLICY "Manager lit et enregistre" ON public.mandatory_doc_signatures AS PERMISSIVE FOR SELECT TO authenticated USING (is_manager());
CREATE POLICY "Salarie signe" ON public.mandatory_doc_signatures AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((employee_id = my_employee_id()));
CREATE POLICY "Salarie voit ses signatures" ON public.mandatory_doc_signatures AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Acces documents communs" ON public.mandatory_docs AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager" ON public.mandatory_docs AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Salaries voient les documents actifs" ON public.mandatory_docs AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active AND (my_employee_id() IS NOT NULL)));
CREATE POLICY "Acces modulation" ON public.modulation_counter AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.modulation_counter AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Nouvel arrivant cree son compteur" ON public.modulation_counter AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((employee_id IN ( SELECT e.id
   FROM employees e
  WHERE can_claim_employee(e.email, e.is_active))));
CREATE POLICY "Salarie voit son compteur" ON public.modulation_counter AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Acces onboarding fields" ON public.onboarding_fields AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Lecture publique onboarding fields" ON public.onboarding_fields AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Manager" ON public.onboarding_fields AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Lecture publique invitations" ON public.onboarding_invitations AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager" ON public.onboarding_invitations AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces onboarding responses" ON public.onboarding_responses AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.onboarding_responses AS PERMISSIVE FOR ALL TO authenticated USING ((is_manager() AND (has_perm('dossiers_rh'::text) OR has_perm('contrats'::text)))) WITH CHECK ((is_manager() AND (has_perm('dossiers_rh'::text) OR has_perm('contrats'::text))));
CREATE POLICY "Salarie ajoute ses reponses" ON public.onboarding_responses AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((employee_id = my_employee_id()));
CREATE POLICY "Salarie gere ses reponses" ON public.onboarding_responses AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Salarie modifie ses reponses" ON public.onboarding_responses AS PERMISSIVE FOR UPDATE TO authenticated USING ((employee_id = my_employee_id())) WITH CHECK ((employee_id = my_employee_id()));
CREATE POLICY "Manager" ON public.payroll_months AS PERMISSIVE FOR ALL TO authenticated USING ((is_manager() AND has_perm('paie'::text))) WITH CHECK ((is_manager() AND has_perm('paie'::text)));
CREATE POLICY "Salarie voit ses heures modulees" ON public.payroll_months AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Acces registre" ON public.personnel_register AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager paie" ON public.personnel_register AS PERMISSIVE FOR SELECT TO authenticated USING ((is_manager() AND (has_perm('paie'::text) OR has_perm('dossiers_rh'::text))));
CREATE POLICY "Acces libre planning_preferences" ON public.planning_preferences AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.planning_preferences AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY allow_all_authenticated ON public.planning_preferences AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Acces libre planning_sector_members" ON public.planning_sector_members AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.planning_sector_members AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY allow_all_authenticated ON public.planning_sector_members AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Acces planning visibility" ON public.planning_visibility AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.planning_visibility AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces pointage sites" ON public.pointage_sites AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.pointage_sites AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces abonnements" ON public.push_subscriptions AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Voit ses appareils" ON public.push_subscriptions AS PERMISSIVE FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Acces schedules" ON public.schedules AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.schedules AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Salarie voit ses creneaux" ON public.schedules AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Admin lecture" ON public.sensitive_access_log AS PERMISSIVE FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Serveur uniquement" ON public.server_secrets AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Acces timeclock" ON public.timeclock AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.timeclock AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Salarie voit ses pointages" ON public.timeclock AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Manager" ON public.timeclock_alerts AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces user profiles" ON public.user_profiles AS PERMISSIVE FOR ALL TO planning_app USING (true) WITH CHECK (true);
CREATE POLICY "Manager" ON public.user_profiles AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Salarie lie sa fiche" ON public.user_profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = auth.uid()) AND (employee_id IS NULL))) WITH CHECK (((id = auth.uid()) AND (role = 'salarie'::text) AND (employee_id IN ( SELECT e.id
   FROM employees e
  WHERE ((lower(e.email) = lower((auth.jwt() ->> 'email'::text))) AND (e.is_active = false))))));
CREATE POLICY "Salarie voit son profil" ON public.user_profiles AS PERMISSIVE FOR SELECT TO authenticated USING ((id = auth.uid()));
CREATE POLICY "Manager" ON public.week_templates AS PERMISSIVE FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager());
CREATE POLICY "Acces historique declarations" ON public.work_declaration_history AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager" ON public.work_declaration_history AS PERMISSIVE FOR SELECT TO authenticated USING (is_manager());
CREATE POLICY "Salarie voit son historique" ON public.work_declaration_history AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Acces declarations" ON public.work_declarations AS PERMISSIVE FOR SELECT TO planning_app USING (true);
CREATE POLICY "Manager" ON public.work_declarations AS PERMISSIVE FOR SELECT TO authenticated USING (is_manager());
CREATE POLICY "Salarie voit ses declarations" ON public.work_declarations AS PERMISSIVE FOR SELECT TO authenticated USING ((employee_id = my_employee_id()));
CREATE POLICY "Authenticated can delete" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING ((bucket_id = 'documents-rh'::text));
CREATE POLICY "Authenticated can read" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'documents-rh'::text));
CREATE POLICY "Authenticated can upload" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((bucket_id = 'documents-rh'::text));
CREATE POLICY "Communs depot manager" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'documents-communs'::text) AND is_manager()));
CREATE POLICY "Communs lecture" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING ((bucket_id = 'documents-communs'::text));
CREATE POLICY "Communs remplacement manager" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'documents-communs'::text) AND is_manager())) WITH CHECK (((bucket_id = 'documents-communs'::text) AND is_manager()));
CREATE POLICY "Communs suppression manager" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'documents-communs'::text) AND is_manager()));
CREATE POLICY "Modeles contrats depot manager" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'modeles-contrats'::text) AND is_manager()));
CREATE POLICY "Modeles contrats lecture manager" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'modeles-contrats'::text) AND is_manager()));
CREATE POLICY "Modeles contrats remplacement manager" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'modeles-contrats'::text) AND is_manager())) WITH CHECK (((bucket_id = 'modeles-contrats'::text) AND is_manager()));
CREATE POLICY "Modeles contrats suppression manager" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'modeles-contrats'::text) AND is_manager()));
CREATE POLICY "RH acces salarie limite a 3 mois apres contrat" ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (((bucket_id <> 'documents-rh'::text) OR is_manager() OR my_documents_accessible()));
CREATE POLICY "RH cloisonnement depot" ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id <> 'documents-rh'::text) OR is_manager() OR ((storage.foldername(name))[1] = (my_employee_id())::text)));
CREATE POLICY "RH cloisonnement lecture" ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (((bucket_id <> 'documents-rh'::text) OR is_manager() OR ((storage.foldername(name))[1] = (my_employee_id())::text)));
CREATE POLICY "RH cloisonnement remplacement" ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (((bucket_id <> 'documents-rh'::text) OR is_manager() OR ((storage.foldername(name))[1] = (my_employee_id())::text))) WITH CHECK (((bucket_id <> 'documents-rh'::text) OR is_manager() OR ((storage.foldername(name))[1] = (my_employee_id())::text)));
CREATE POLICY "RH cloisonnement suppression" ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (((bucket_id <> 'documents-rh'::text) OR is_manager()));
CREATE POLICY "Salarie peut remplacer ses fichiers" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'documents-rh'::text) AND ((storage.foldername(name))[1] = ( SELECT (user_profiles.employee_id)::text AS employee_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid()))))) WITH CHECK (((bucket_id = 'documents-rh'::text) AND ((storage.foldername(name))[1] = ( SELECT (user_profiles.employee_id)::text AS employee_id
   FROM user_profiles
  WHERE (user_profiles.id = auth.uid())))));

-- ===== Droits =====
GRANT SELECT ON public.absence_requests TO planning_app;
GRANT INSERT, SELECT, UPDATE ON public.app_settings TO planning_app;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.employees TO planning_app;
GRANT SELECT ON public.mandatory_doc_signatures TO planning_app;
GRANT SELECT ON public.mandatory_docs TO planning_app;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.modulation_counter TO planning_app;
GRANT SELECT ON public.personnel_register TO planning_app;
GRANT DELETE, SELECT ON public.push_subscriptions TO planning_app;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.schedules TO planning_app;
GRANT INSERT, SELECT ON public.server_secrets TO planning_app;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON public.timeclock TO planning_app;
GRANT SELECT ON public.user_profiles TO planning_app;
GRANT SELECT ON public.work_declaration_history TO planning_app;
GRANT SELECT ON public.work_declarations TO planning_app;
REVOKE ALL ON FUNCTION public.absence_notification_data(p_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_confirm_declarations() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_claim_employee(p_email text, p_active boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_reveal() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_access_link(p_token text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_cp_blackout() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_invitation_code(p_code text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_access_link(p_token text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_access_link(p_employee_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_backup_snapshot(p_kind text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.declaration_lock_at(p_date date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.declare_work(p_schedule_id uuid, p_status text, p_start time without time zone, p_end time without time zone, p_break integer, p_comment text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_employee(p_employee_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_push_subscription(p_endpoint text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.docs_access_candidates() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.employees_last_sign_in() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_employee_nss() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.encrypt_sensitive_response() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.export_schema_sql() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_encryption_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_perm(p_perm text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_perm_user(p_user uuid, p_perm text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_manager() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_sensitive_field(p_field uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.keep_declaration_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_accounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_timeclock_alert(p_schedule_id uuid, p_kind text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mask_sensitive(v text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_nss(p_candidates text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_documents_accessible() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.my_employee_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pending_timeclock_alerts(p_delay integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_employee_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_employee_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_roles_setting() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_user_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_departed_sensitive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reveal_employee_nss(p_employee uuid, p_reason text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reveal_response(p_response uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sensitive_key() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_role(p_user uuid, p_role text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_doc_signature() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_declaration_timeclock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_personnel_register() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.timeclock_enabled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_last_seen() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.absence_notification_data(p_id uuid) TO planning_app;
GRANT EXECUTE ON FUNCTION public.absence_notification_data(p_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_confirm_declarations() TO planning_app;
GRANT EXECUTE ON FUNCTION public.auto_confirm_declarations() TO service_role;
GRANT EXECUTE ON FUNCTION public.can_claim_employee(p_email text, p_active boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_claim_employee(p_email text, p_active boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_reveal() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_reveal() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_access_link(p_token text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_access_link(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_access_link(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_access_link(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_cp_blackout() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_invitation_code(p_code text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_invitation_code(p_code text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_invitation_code(p_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_invitation_code(p_code text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_access_link(p_token text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_access_link(p_token text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_access_link(p_employee_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_access_link(p_employee_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_backup_snapshot(p_kind text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_backup_snapshot(p_kind text) TO planning_app;
GRANT EXECUTE ON FUNCTION public.create_backup_snapshot(p_kind text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_user_profile() TO service_role;
GRANT EXECUTE ON FUNCTION public.declaration_lock_at(p_date date) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.declaration_lock_at(p_date date) TO anon;
GRANT EXECUTE ON FUNCTION public.declaration_lock_at(p_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declaration_lock_at(p_date date) TO planning_app;
GRANT EXECUTE ON FUNCTION public.declaration_lock_at(p_date date) TO service_role;
GRANT EXECUTE ON FUNCTION public.declare_work(p_schedule_id uuid, p_status text, p_start time without time zone, p_end time without time zone, p_break integer, p_comment text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.declare_work(p_schedule_id uuid, p_status text, p_start time without time zone, p_end time without time zone, p_break integer, p_comment text) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_employee(p_employee_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_employee(p_employee_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(p_endpoint text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(p_endpoint text) TO service_role;
GRANT EXECUTE ON FUNCTION public.docs_access_candidates() TO planning_app;
GRANT EXECUTE ON FUNCTION public.docs_access_candidates() TO service_role;
GRANT EXECUTE ON FUNCTION public.employees_last_sign_in() TO authenticated;
GRANT EXECUTE ON FUNCTION public.employees_last_sign_in() TO planning_app;
GRANT EXECUTE ON FUNCTION public.employees_last_sign_in() TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_employee_nss() TO service_role;
GRANT EXECUTE ON FUNCTION public.encrypt_sensitive_response() TO service_role;
GRANT EXECUTE ON FUNCTION public.export_schema_sql() TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_schema_sql() TO planning_app;
GRANT EXECUTE ON FUNCTION public.export_schema_sql() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_encryption_key() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_encryption_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_perm(p_perm text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(p_perm text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_perm_user(p_user uuid, p_perm text) TO planning_app;
GRANT EXECUTE ON FUNCTION public.has_perm_user(p_user uuid, p_perm text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_sensitive_field(p_field uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sensitive_field(p_field uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.keep_declaration_history() TO service_role;
GRANT EXECUTE ON FUNCTION public.list_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_accounts() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_timeclock_alert(p_schedule_id uuid, p_kind text) TO planning_app;
GRANT EXECUTE ON FUNCTION public.mark_timeclock_alert(p_schedule_id uuid, p_kind text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mask_sensitive(v text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.mask_sensitive(v text) TO anon;
GRANT EXECUTE ON FUNCTION public.mask_sensitive(v text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mask_sensitive(v text) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_nss(p_candidates text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_nss(p_candidates text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.my_documents_accessible() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_documents_accessible() TO service_role;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.pending_timeclock_alerts(p_delay integer) TO planning_app;
GRANT EXECUTE ON FUNCTION public.pending_timeclock_alerts(p_delay integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) TO anon;
GRANT EXECUTE ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) TO planning_app;
GRANT EXECUTE ON FUNCTION public.process_timeclock_scan(p_employee_id uuid, p_action text) TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_employee_fields() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.protect_employee_fields() TO anon;
GRANT EXECUTE ON FUNCTION public.protect_employee_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.protect_employee_fields() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_employee_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_roles_setting() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_user_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_departed_sensitive() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_departed_sensitive() TO planning_app;
GRANT EXECUTE ON FUNCTION public.purge_departed_sensitive() TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_employee_nss(p_employee uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_employee_nss(p_employee uuid, p_reason text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reveal_response(p_response uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_response(p_response uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sensitive_key() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_role(p_user uuid, p_role text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(p_user uuid, p_role text) TO service_role;
GRANT EXECUTE ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) TO anon;
GRANT EXECUTE ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) TO planning_app;
GRANT EXECUTE ON FUNCTION public.shift_bounds(p_date date, p_start time without time zone, p_end time without time zone, OUT starts_at timestamp with time zone, OUT ends_at timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION public.stamp_doc_signature() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_declaration_timeclock() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_personnel_register() TO service_role;
GRANT EXECUTE ON FUNCTION public.timeclock_enabled() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.timeclock_enabled() TO anon;
GRANT EXECUTE ON FUNCTION public.timeclock_enabled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.timeclock_enabled() TO planning_app;
GRANT EXECUTE ON FUNCTION public.timeclock_enabled() TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_last_seen() TO service_role;