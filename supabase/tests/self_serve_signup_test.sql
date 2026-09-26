-- pgTAP: self-serve signup storage and status-driven access (COUNCIL-2026-034,
-- migration 20260926130000_self_serve_signup.sql)
-- Run with: supabase test db

BEGIN;
SELECT plan(7);
\ir helpers/fixtures.inc

SELECT ok(NOT has_table_privilege('anon', 'public.pending_signups', 'SELECT'), 'anon cannot read pending signups');
SELECT ok(NOT has_table_privilege('authenticated', 'public.pending_signups', 'SELECT'), 'signed-in users cannot read pending signups');
SELECT ok(NOT has_table_privilege('authenticated', 'public.pending_signups', 'INSERT'), 'signed-in users cannot stage signups directly');

-- Amendment 7: status drives tenant_active for every member, both ways.
RESET ROLE;
UPDATE public.organizations SET status = 'suspended' WHERE id = pg_temp.fixture_id('org-a');
SELECT is((SELECT bool_or(tenant_active) FROM public.profile_roles WHERE org_id = pg_temp.fixture_id('org-a')),
  false, 'suspending an org cuts every member''s access');
SELECT is((SELECT bool_and(tenant_active) FROM public.profile_roles WHERE org_id = pg_temp.fixture_id('org-b')),
  true, 'other orgs are untouched');

UPDATE public.organizations SET status = 'active' WHERE id = pg_temp.fixture_id('org-a');
SELECT is((SELECT bool_and(tenant_active) FROM public.profile_roles WHERE org_id = pg_temp.fixture_id('org-a')),
  true, 'reactivating an org (e.g. after payment) restores access');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('admin');
SELECT is(public.current_user_org_id(), pg_temp.fixture_id('org-a'), 'the admin''s org resolves again after reactivation');

SELECT * FROM finish();
ROLLBACK;
