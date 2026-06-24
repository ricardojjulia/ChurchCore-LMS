-- Fix stamp_course_org_id trigger: only auto-stamp when org_id is not already
-- provided. The original trigger unconditionally overwrote org_id with
-- current_user_org_id(), which returns NULL under the service role, causing
-- platform-admin operations (demo seed, imports) to fail with a NOT NULL
-- violation. Mirrors the defensive pattern used by stamp_course_block_org_id.

CREATE OR REPLACE FUNCTION public.stamp_course_org_id()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.current_user_org_id();
  END IF;
  RETURN NEW;
END;
$$;
