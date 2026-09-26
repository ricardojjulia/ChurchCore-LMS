-- ─── org_id defaults to the caller's org on every org-scoped table ───────────
-- Found by the COUNCIL-2026-031 flows.
--
-- The 2026-06 tenant-isolation migrations made org_id NOT NULL across the
-- schema and wrote RLS WITH CHECK (current_user_org_id() = org_id), but only
-- courses, course_blocks and enrollments got a stamping trigger. Every other
-- insert path that omitted org_id failed — announcements and calendar events
-- could not be created, among others the suite exercised — typically surfacing
-- the raw "violates row-level security policy" message to the user.
--
-- Rule: a row a signed-in user creates belongs to that user's org unless the
-- insert says otherwise. A column DEFAULT expresses exactly that:
--   * explicit org_id values are untouched (platform-admin cross-org writes);
--   * service-role inserts have no session, current_user_org_id() is NULL, and
--     the NOT NULL constraint still rejects a missing org_id as before;
--   * RLS WITH CHECK still compares org_id to the caller's org, so the default
--     cannot place a row in another tenant.
--
-- Applied to every public table whose org_id is NOT NULL and has no default,
-- so tables added later that follow the same shape should get the same
-- default in their own migration.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND c.is_nullable = 'NO'
      AND c.column_default IS NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT public.current_user_org_id()',
      r.table_name
    );
  END LOOP;
END $$;
