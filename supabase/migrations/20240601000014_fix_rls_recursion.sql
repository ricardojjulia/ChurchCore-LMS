-- Fix infinite recursion in profiles RLS policies.
--
-- Root cause: policies like "profiles: admin manager read all" call
-- current_user_role(), which queries public.profiles, which triggers the same
-- policies again → infinite recursion (SQLSTATE 42P17).
--
-- Fix: introduce a separate public.profile_roles table that stores only
-- auth_id → role/status/uid. Helper functions read from THIS table instead of
-- profiles. profile_roles has RLS enabled but NO client-readable policies, so
-- it is only accessible via SECURITY DEFINER helper functions. There is no
-- recursive loop because profile_roles is a different table from profiles.

-- ─── 1. Helper table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profile_roles (
  auth_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  uid     uuid NOT NULL,
  role    public.user_role   NOT NULL DEFAULT 'student',
  status  public.user_status NOT NULL DEFAULT 'active'
);

-- RLS is ON with NO client-visible policies → clients can never read directly.
-- Helper functions use SECURITY DEFINER to bypass this safely.
ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;

-- ─── 2. Populate from current profiles ───────────────────────────────────────

INSERT INTO public.profile_roles (auth_id, uid, role, status)
SELECT auth_id, uid, role, status
FROM public.profiles
ON CONFLICT (auth_id) DO UPDATE
  SET uid    = EXCLUDED.uid,
      role   = EXCLUDED.role,
      status = EXCLUDED.status;

-- ─── 3. Keep profile_roles in sync via trigger ───────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_profile_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profile_roles (auth_id, uid, role, status)
    VALUES (NEW.auth_id, NEW.uid, NEW.role, NEW.status)
    ON CONFLICT (auth_id) DO UPDATE
      SET uid    = EXCLUDED.uid,
          role   = EXCLUDED.role,
          status = EXCLUDED.status;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.profile_roles
    SET uid    = NEW.uid,
        role   = NEW.role,
        status = NEW.status
    WHERE auth_id = NEW.auth_id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_roles WHERE auth_id = OLD.auth_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_roles ON public.profiles;
CREATE TRIGGER trg_sync_profile_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_roles();

-- ─── 4. Rewrite helper functions to read from profile_roles ──────────────────
-- SECURITY DEFINER lets them bypass profile_roles' RLS (no client policies).
-- They do NOT touch public.profiles at all → zero recursion risk.

CREATE OR REPLACE FUNCTION public.current_user_uid()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uid FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profile_roles
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_status()
RETURNS public.user_status
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT status FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ─── 5. Rebuild profiles policies that caused recursion ──────────────────────
-- The "self read" policy already uses auth_id = auth.uid() (no function call,
-- no recursion). Only the policies that called current_user_role() on the
-- profiles table itself needed fixing — they now call the updated function
-- which reads from profile_roles, not from profiles.

-- Self-update: the WITH CHECK previously subqueried profiles directly.
-- Now uses current_user_role() / current_user_status() (reads profile_roles).
DROP POLICY IF EXISTS "profiles: self update non-privileged fields" ON public.profiles;
CREATE POLICY "profiles: self update non-privileged fields"
  ON public.profiles FOR UPDATE
  USING  (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
    AND role   = public.current_user_role()
    AND status = public.current_user_status()
  );

-- Note: "profiles: admin manager read all", "profiles: teacher read enrolled
-- students", "profiles: admin full update", and "profiles: admin insert" already
-- called current_user_role() which now reads from profile_roles — no change to
-- those policy definitions needed, only the function body changed above.
