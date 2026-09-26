-- COUNCIL-2026-044 — survey, checklist and flashcard blocks; remove the
-- `section` and `certificate` placeholders.
--
-- Survey anonymity is structural (Amendment 2): an anonymous survey's
-- responses never carry the respondent's uid, participation (used for
-- completion and one-response-per-learner) is stored in a separate table, and
-- both timestamps are truncated to the day so responses cannot be matched to
-- participants by time. The anonymous setting is locked once anyone responds.

-- ── Block type registry ──────────────────────────────────────────────────────
UPDATE public.block_types SET is_active = true WHERE id IN ('survey', 'checklist', 'flashcard_set');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.course_blocks WHERE block_type_id IN ('section', 'certificate')) THEN
    RAISE EXCEPTION 'course_blocks still reference the section/certificate block types; migrate them before removing the types';
  END IF;
END;
$$;
DELETE FROM public.block_types WHERE id IN ('section', 'certificate');

-- ── Surveys ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.survey_responses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid        NOT NULL DEFAULT public.current_user_org_id()
                             REFERENCES public.organizations(id) ON DELETE CASCADE,
  block_id       uuid        NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
  respondent_uid uuid        REFERENCES public.profiles(uid) ON DELETE SET NULL,
  answers        jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS survey_responses_block_idx ON public.survey_responses (block_id);

CREATE TABLE IF NOT EXISTS public.survey_participation (
  block_id   uuid        NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
  user_uid   uuid        NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  org_id     uuid        NOT NULL DEFAULT public.current_user_org_id()
                         REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (block_id, user_uid)
);

ALTER TABLE public.survey_responses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_participation ENABLE ROW LEVEL SECURITY;

-- True when the caller is enrolled in the published block's course, in their org.
CREATE OR REPLACE FUNCTION public.can_respond_to_block(p_block_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.course_blocks cb
    JOIN public.courses c      ON c.id = cb.course_id
    JOIN public.enrollments e  ON e.course_id = cb.course_id AND e.user_id = public.current_user_uid()
    WHERE cb.id = p_block_id
      AND cb.is_published
      AND c.org_id = public.current_user_org_id()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_respond_to_block(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_respond_to_block(uuid) TO authenticated;

-- Server-side stamping: respondent identity and timestamps are never trusted
-- from the client.
CREATE OR REPLACE FUNCTION public.stamp_survey_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anonymous boolean;
BEGIN
  SELECT coalesce((cb.content->>'anonymous')::boolean, true) INTO v_anonymous
  FROM public.course_blocks cb WHERE cb.id = NEW.block_id AND cb.block_type_id = 'survey';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not a survey block' USING ERRCODE = '22023';
  END IF;
  NEW.respondent_uid := CASE WHEN v_anonymous THEN NULL ELSE public.current_user_uid() END;
  NEW.created_at     := CASE WHEN v_anonymous THEN date_trunc('day', now()) ELSE now() END;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_stamp_survey_response ON public.survey_responses;
CREATE TRIGGER trg_stamp_survey_response
  BEFORE INSERT ON public.survey_responses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_survey_response();

CREATE OR REPLACE FUNCTION public.stamp_survey_participation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.user_uid   := public.current_user_uid();
  NEW.created_at := date_trunc('day', now());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_stamp_survey_participation ON public.survey_participation;
CREATE TRIGGER trg_stamp_survey_participation
  BEFORE INSERT ON public.survey_participation
  FOR EACH ROW EXECUTE FUNCTION public.stamp_survey_participation();

REVOKE EXECUTE ON FUNCTION public.stamp_survey_response()      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_survey_participation() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "survey_responses: enrolled learners respond" ON public.survey_responses;
CREATE POLICY "survey_responses: enrolled learners respond"
  ON public.survey_responses FOR INSERT TO authenticated
  WITH CHECK (public.current_user_org_id() = org_id AND public.can_respond_to_block(block_id));

DROP POLICY IF EXISTS "survey_responses: staff read own org" ON public.survey_responses;
CREATE POLICY "survey_responses: staff read own org"
  ON public.survey_responses FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.current_user_org_id() = org_id
        AND public.current_user_role() = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'teacher'::user_role]))
  );

DROP POLICY IF EXISTS "survey_participation: enrolled learners record" ON public.survey_participation;
CREATE POLICY "survey_participation: enrolled learners record"
  ON public.survey_participation FOR INSERT TO authenticated
  WITH CHECK (public.current_user_org_id() = org_id AND public.can_respond_to_block(block_id));

DROP POLICY IF EXISTS "survey_participation: own rows and staff" ON public.survey_participation;
CREATE POLICY "survey_participation: own rows and staff"
  ON public.survey_participation FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.current_user_org_id() = org_id
        AND (user_uid = public.current_user_uid()
             OR public.current_user_role() = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'teacher'::user_role])))
  );

-- Anonymity cannot change once anyone has responded (Amendment 2).
CREATE OR REPLACE FUNCTION public.lock_survey_anonymity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.block_type_id = 'survey'
     AND coalesce((OLD.content->>'anonymous')::boolean, true)
         IS DISTINCT FROM coalesce((NEW.content->>'anonymous')::boolean, true)
     AND EXISTS (SELECT 1 FROM public.survey_participation sp WHERE sp.block_id = OLD.id) THEN
    RAISE EXCEPTION 'survey anonymity cannot change after responses exist' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.lock_survey_anonymity() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_lock_survey_anonymity ON public.course_blocks;
CREATE TRIGGER trg_lock_survey_anonymity
  BEFORE UPDATE OF content ON public.course_blocks
  FOR EACH ROW EXECUTE FUNCTION public.lock_survey_anonymity();

-- ── Checklists ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.checklist_progress (
  block_id   uuid        NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
  user_uid   uuid        NOT NULL DEFAULT public.current_user_uid() REFERENCES public.profiles(uid) ON DELETE CASCADE,
  org_id     uuid        NOT NULL DEFAULT public.current_user_org_id()
                         REFERENCES public.organizations(id) ON DELETE CASCADE,
  checked    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (block_id, user_uid)
);
ALTER TABLE public.checklist_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checklist_progress: learners manage own" ON public.checklist_progress;
CREATE POLICY "checklist_progress: learners manage own"
  ON public.checklist_progress FOR ALL TO authenticated
  USING (public.current_user_org_id() = org_id AND user_uid = public.current_user_uid())
  WITH CHECK (public.current_user_org_id() = org_id AND user_uid = public.current_user_uid()
              AND public.can_respond_to_block(block_id));

DROP POLICY IF EXISTS "checklist_progress: staff read own org" ON public.checklist_progress;
CREATE POLICY "checklist_progress: staff read own org"
  ON public.checklist_progress FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.current_user_org_id() = org_id
        AND public.current_user_role() = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'teacher'::user_role]))
  );

GRANT SELECT, INSERT ON public.survey_responses, public.survey_participation TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_progress TO authenticated;

-- One transaction for participation + response, run as the caller (RLS and
-- the stamping triggers apply). The participation primary key makes a second
-- response fail before any answers are written.
CREATE OR REPLACE FUNCTION public.submit_survey(p_block_id uuid, p_answers jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.survey_participation (block_id) VALUES (p_block_id);
  INSERT INTO public.survey_responses (block_id, answers) VALUES (p_block_id, p_answers);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_survey(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_survey(uuid, jsonb) TO authenticated;
