-- Fix cross-table RLS recursion.
--
-- Two policies access public.profiles directly from within other tables:
--
--  1. "courses: visible to qualified users" does:
--       (SELECT profiles.current_level FROM profiles WHERE profiles.auth_id = auth.uid()) >= min_required_level
--     When evaluated via the "profiles: teacher read enrolled students" subquery →
--     profiles → courses → profiles = infinite recursion.
--
--  2. "organizations: members read own org" does:
--       id = (SELECT profiles.org_id FROM profiles WHERE profiles.auth_id = auth.uid())
--     Same pattern — direct profiles access from another table's policy.
--
-- Fix: extend profile_roles with current_level and org_id, add helper functions
-- current_user_level() and current_user_org_id() reading from profile_roles,
-- then rewrite the two offending policies.
-- Also add a SELECT policy on profile_roles so the SECURITY DEFINER helpers
-- (running as non-superuser postgres) can actually read it.

-- ─── 1. Extend profile_roles with more columns ────────────────────────────────

ALTER TABLE public.profile_roles
  ADD COLUMN IF NOT EXISTS current_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS org_id        uuid;

-- ─── 2. Back-fill from profiles ──────────────────────────────────────────────

UPDATE public.profile_roles pr
SET current_level = COALESCE(p.current_level, 1),
    org_id        = p.org_id
FROM public.profiles p
WHERE pr.auth_id = p.auth_id;

-- ─── 3. Add SELECT policy so SECURITY DEFINER helpers can read their own row ──
-- Even though the function runs as postgres (not a superuser in Supabase hosted),
-- auth.uid() in session config is still available, so self-read works.

DROP POLICY IF EXISTS "profile_roles: fn read own" ON public.profile_roles;
CREATE POLICY "profile_roles: fn read own"
  ON public.profile_roles FOR SELECT
  USING (auth_id = auth.uid());

-- ─── 4. Update helper functions to include new fields ─────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_level()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_level FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- ─── 5. Update sync trigger to also copy current_level and org_id ─────────────

CREATE OR REPLACE FUNCTION public.sync_profile_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profile_roles (auth_id, uid, role, status, current_level, org_id)
    VALUES (NEW.auth_id, NEW.uid, NEW.role, NEW.status,
            COALESCE(NEW.current_level, 1), NEW.org_id)
    ON CONFLICT (auth_id) DO UPDATE
      SET uid           = EXCLUDED.uid,
          role          = EXCLUDED.role,
          status        = EXCLUDED.status,
          current_level = EXCLUDED.current_level,
          org_id        = EXCLUDED.org_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.profile_roles
    SET uid           = NEW.uid,
        role          = NEW.role,
        status        = NEW.status,
        current_level = COALESCE(NEW.current_level, 1),
        org_id        = NEW.org_id
    WHERE auth_id = NEW.auth_id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_roles WHERE auth_id = OLD.auth_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 6. Rewrite "courses: visible to qualified users" — remove profiles subquery

DROP POLICY IF EXISTS "courses: visible to qualified users" ON public.courses;
CREATE POLICY "courses: visible to qualified users"
  ON public.courses FOR SELECT
  USING (
    -- Staff see everything
    current_user_role() = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'teacher'::user_role])
    OR (
      -- Students see published courses they qualify for
      status = 'published'
      AND current_user_level() >= min_required_level
      AND (
        prerequisite_course_id IS NULL
        OR EXISTS (
          SELECT 1 FROM course_enrollments ce
          WHERE ce.user_id = current_user_uid()
            AND ce.course_id = courses.prerequisite_course_id
        )
      )
    )
  );

-- ─── 7. Rewrite "organizations: members read own org" — remove profiles subquery

DROP POLICY IF EXISTS "organizations: members read own org" ON public.organizations;
CREATE POLICY "organizations: members read own org"
  ON public.organizations FOR SELECT
  USING (
    id = current_user_org_id()
  );
