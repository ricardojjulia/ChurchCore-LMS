-- Protect OneRoster-owned academic fields while allowing LMS-local enrichment.
CREATE OR REPLACE FUNCTION public.guard_externally_managed_academic_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE v_managed boolean;
BEGIN
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.external_entity_links l
    WHERE l.org_id = NEW.org_id
      AND l.local_table = TG_TABLE_NAME
      AND l.local_id = NEW.id
      AND l.managed_by_external_system
  ) INTO v_managed;

  IF NOT v_managed THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'academic_terms' AND (
    NEW.term_name IS DISTINCT FROM OLD.term_name
    OR NEW.term_code IS DISTINCT FROM OLD.term_code
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.parent_term_id IS DISTINCT FROM OLD.parent_term_id
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Externally managed term fields cannot be edited locally'
      USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'course_blueprints' AND (
    NEW.course_code IS DISTINCT FROM OLD.course_code
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Externally managed blueprint fields cannot be edited locally'
      USING ERRCODE = '42501';
  ELSIF TG_TABLE_NAME = 'course_sections' AND (
    NEW.blueprint_id IS DISTINCT FROM OLD.blueprint_id
    OR NEW.term_id IS DISTINCT FROM OLD.term_id
    OR NEW.section_code IS DISTINCT FROM OLD.section_code
    OR NEW.delivery_format IS DISTINCT FROM OLD.delivery_format
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    RAISE EXCEPTION 'Externally managed section fields cannot be edited locally'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_externally_managed_academic_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_external_academic_terms_update ON public.academic_terms;
CREATE TRIGGER guard_external_academic_terms_update
  BEFORE UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.guard_externally_managed_academic_update();

DROP TRIGGER IF EXISTS guard_external_course_blueprints_update ON public.course_blueprints;
CREATE TRIGGER guard_external_course_blueprints_update
  BEFORE UPDATE ON public.course_blueprints
  FOR EACH ROW EXECUTE FUNCTION public.guard_externally_managed_academic_update();

DROP TRIGGER IF EXISTS guard_external_course_sections_update ON public.course_sections;
CREATE TRIGGER guard_external_course_sections_update
  BEFORE UPDATE ON public.course_sections
  FOR EACH ROW EXECUTE FUNCTION public.guard_externally_managed_academic_update();
