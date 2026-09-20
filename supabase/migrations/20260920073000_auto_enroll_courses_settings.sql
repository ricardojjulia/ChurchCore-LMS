-- COUNCIL-2026-026 Prompt A — org_id stamping trigger + auto_enroll_courses
-- settings contract.
--
-- Two independent pieces:
--
--  1. stamp_enrollment_org_id() — a BEFORE INSERT trigger on public.enrollments
--     that fixes a live bug: enrollSelf() (src/app/actions/learning.ts) inserts
--     into enrollments without setting org_id. org_id is NOT NULL with no
--     DEFAULT, and the only existing trigger on this table
--     (trg_refresh_perf_on_enrollment) fires AFTER INSERT/UPDATE — nothing
--     stamps the column beforehand. Every real call to enrollSelf() against a
--     live database throws a NOT NULL constraint violation. This was invisible
--     because learning.test.ts fully mocks the Supabase client (cannot enforce
--     real column constraints) and no e2e test exercises enrollSelf() against
--     a real database.
--
--     The trigger only fills a NULL org_id — it never overrides a
--     caller-supplied value — so the existing RLS
--     WITH CHECK (current_user_org_id() = org_id) semantics on the
--     authenticated "enrollments: students enroll own org" policy are
--     unchanged. It looks up org_id from the *inserting user's own*
--     profile_roles row (keyed by NEW.user_id, i.e. profiles.uid), not from
--     current_user_org_id()/auth.uid(), so it works identically whether the
--     insert happens under a real user session (self-enroll) or under the
--     service-role client with no session (registration-time auto-enroll).
--
--  2. Documentation of the organizations.settings.auto_enroll_courses JSONB
--     contract (COUNCIL-2026-026 D3) — no schema change needed since
--     `settings` is already a JSONB column, reused the same way
--     branding/features/onboarding/demo settings already are. A CHECK
--     constraint enforces the array-of-≤10-entries shape whenever the key is
--     present, so a malformed write fails fast at the schema layer rather
--     than silently corrupting the settings blob.

-- ─── 1. stamp_enrollment_org_id() BEFORE INSERT trigger ───────────────────────

CREATE OR REPLACE FUNCTION public.stamp_enrollment_org_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.profile_roles
    WHERE uid = NEW.user_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.stamp_enrollment_org_id() IS
  'BEFORE INSERT trigger fn for public.enrollments. SECURITY INVOKER (not '
  'DEFINER, per CLAUDE.md Security Rule 1) — runs under the inserting role''s '
  'own RLS context so it can only ever derive org_id from the inserting '
  'user''s own profile_roles row. Fills NEW.org_id from profile_roles.org_id '
  '(keyed by NEW.user_id) only when NEW.org_id is NULL; never overrides a '
  'caller-supplied value. Fixes the live bug where enrollSelf() inserted into '
  'enrollments without setting the NOT NULL org_id column (COUNCIL-2026-026).';

DROP TRIGGER IF EXISTS trg_stamp_enrollment_org_id ON public.enrollments;
CREATE TRIGGER trg_stamp_enrollment_org_id
  BEFORE INSERT ON public.enrollments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_enrollment_org_id();

-- ─── 2. auto_enroll_courses settings contract (documentation + guard rail) ────
--
-- Contract: organizations.settings.auto_enroll_courses, when present, is a
-- JSON array of up to 10 course UUID strings (as text — settings is JSONB, so
-- entries are stored as JSON strings, not native uuid). An org admin opts a
-- course in explicitly via /admin/settings (AutoEnrollSection, Prompt C);
-- nothing is auto-enrolled by default for an org that hasn't configured it.
-- Read by src/app/join/actions.ts (verifyAndEnroll, service client, capped to
-- the first 10 entries even if more are somehow present) and written by
-- src/app/actions/org-settings.ts (addAutoEnrollCourse / removeAutoEnrollCourse,
-- which enforce the 10-entry cap in code before it ever reaches this
-- constraint).

COMMENT ON COLUMN public.organizations.settings IS
  'Per-org JSONB settings blob. Known sub-keys include branding, features, '
  'onboarding, demo, and auto_enroll_courses (COUNCIL-2026-026): a JSON array '
  'of up to 10 course id strings that are auto-enrolled for a student at '
  'registration time (src/app/join/actions.ts verifyAndEnroll), gated through '
  'the same enrollCore() checks as any other enrollment. Absent or empty means '
  'no auto-enrollment for that org.';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_auto_enroll_courses_shape;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_auto_enroll_courses_shape
  CHECK (
    NOT (settings ? 'auto_enroll_courses')
    OR (
      jsonb_typeof(settings -> 'auto_enroll_courses') = 'array'
      AND jsonb_array_length(settings -> 'auto_enroll_courses') <= 10
    )
  );
