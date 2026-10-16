-- A executer une fois dans Supabase > SQL Editor (projet akulbjtaflucxkuwptjv)

-- 1. Planning : un salarie ne voit que ses creneaux publies (les brouillons restent visibles des managers)
DROP POLICY IF EXISTS "Salarie voit ses creneaux" ON public.schedules;
CREATE POLICY "Salarie voit ses creneaux" ON public.schedules AS PERMISSIVE FOR SELECT TO authenticated
  USING (employee_id = public.my_employee_id() AND is_published);

-- 2. Creneaux passes jamais publies (avant la semaine en cours) : publies sans message
UPDATE public.schedules SET is_published = true
 WHERE is_published = false
   AND work_date < date_trunc('week', (now() AT TIME ZONE 'Europe/Paris'))::date;

-- 3. Logement : question Oui/Non dans l'onboarding (apres la conduite de voiturette)
INSERT INTO public.onboarding_fields (label, field_type, required, options, sort_order, is_active)
SELECT 'Logement souhaite et valide avec la direction', 'select', true, 'Oui|Non', 14, true
WHERE NOT EXISTS (SELECT 1 FROM public.onboarding_fields WHERE label = 'Logement souhaite et valide avec la direction');

-- 4. Logement : date d'envoi du lien de caution par email
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS caution_lien_envoye_at timestamptz;

-- 5. Champs que le salarie ne peut pas modifier lui-meme (ajout de caution_lien_envoye_at)
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
    NEW.archived_at := OLD.archived_at; NEW.caution_lien_envoye_at := OLD.caution_lien_envoye_at;
  END IF;
  RETURN NEW;
END;
$function$;
