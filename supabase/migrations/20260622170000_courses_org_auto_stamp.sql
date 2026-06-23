-- Auto-stamp org_id on courses INSERT so RLS WITH CHECK always matches.
--
-- The courses INSERT policy requires: current_user_org_id() = org_id
-- Previously, clients had to supply org_id from outside Postgres, which was
-- fragile (wrong value → RLS rejection). This trigger sets org_id inside
-- Postgres immediately before the RLS check runs, so the two values are
-- always identical regardless of what the client sends.

CREATE OR REPLACE FUNCTION public.stamp_course_org_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.org_id := public.current_user_org_id();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_course_org_id ON public.courses;
CREATE TRIGGER trg_stamp_course_org_id
  BEFORE INSERT ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.stamp_course_org_id();
