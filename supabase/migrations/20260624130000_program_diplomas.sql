-- Maps program tracks to their required courses (with ordering)
CREATE TABLE IF NOT EXISTS public.program_track_courses (
  track_id       UUID     NOT NULL REFERENCES public.program_tracks(id)  ON DELETE CASCADE,
  course_id      UUID     NOT NULL REFERENCES public.courses(id)         ON DELETE CASCADE,
  sequence_order SMALLINT NOT NULL DEFAULT 0,
  is_required    BOOLEAN  NOT NULL DEFAULT TRUE,
  PRIMARY KEY (track_id, course_id)
);

ALTER TABLE public.program_track_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_track_courses: admin manager write"
  ON public.program_track_courses FOR ALL TO authenticated
  USING (public.is_platform_admin() OR public.current_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.is_platform_admin() OR public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "program_track_courses: authenticated read"
  ON public.program_track_courses FOR SELECT TO authenticated
  USING (public.current_user_uid() IS NOT NULL);

-- Diploma awarded when all required courses in a track are completed
CREATE TABLE IF NOT EXISTS public.program_diplomas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(uid)       ON DELETE CASCADE,
  track_id    UUID        NOT NULL REFERENCES public.program_tracks(id)  ON DELETE CASCADE,
  awarded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diploma_no  TEXT        UNIQUE NOT NULL DEFAULT ('DIPL-' || UPPER(SUBSTR(gen_random_uuid()::TEXT, 1, 8))),
  org_id      UUID        REFERENCES public.organizations(id)            ON DELETE CASCADE,
  UNIQUE (user_id, track_id)
);

ALTER TABLE public.program_diplomas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_diplomas: user reads own"
  ON public.program_diplomas FOR SELECT TO authenticated
  USING (public.current_user_uid() = user_id);

CREATE POLICY "program_diplomas: staff reads org"
  ON public.program_diplomas FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (public.current_user_role() IN ('admin', 'manager', 'teacher')
        AND public.current_user_org_id() = org_id)
  );

-- Trigger: fires after each course_certificate INSERT
-- Checks if the student has now completed all required courses in any track
CREATE OR REPLACE FUNCTION public.check_program_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT ptc.track_id,
           pt.org_id
    FROM   public.program_track_courses ptc
    JOIN   public.program_tracks        pt  ON pt.id = ptc.track_id
    WHERE  ptc.course_id  = NEW.course_id
      AND  ptc.is_required = TRUE
  LOOP
    -- Award diploma only if ALL required courses in this track are now certified
    IF NOT EXISTS (
      SELECT 1
      FROM   public.program_track_courses ptc2
      WHERE  ptc2.track_id   = rec.track_id
        AND  ptc2.is_required = TRUE
        AND  NOT EXISTS (
               SELECT 1 FROM public.course_certificates cc
               WHERE  cc.user_id   = NEW.user_id
                 AND  cc.course_id = ptc2.course_id
             )
    ) THEN
      INSERT INTO public.program_diplomas (user_id, track_id, org_id)
      VALUES (NEW.user_id, rec.track_id, rec.org_id)
      ON CONFLICT (user_id, track_id) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_program_completion
  AFTER INSERT ON public.course_certificates
  FOR EACH ROW EXECUTE FUNCTION public.check_program_completion();
