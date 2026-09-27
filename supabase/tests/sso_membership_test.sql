-- pgTAP: signing in never grants membership (COUNCIL-2026-037 Amendment 1).
-- An account created by an OAuth sign-in has no app_metadata role or org, so
-- handle_new_user() gives it neither, and RLS gives it nothing to read.
-- Run with: supabase test db

BEGIN;
SELECT plan(5);
\ir helpers/fixtures.inc

RESET ROLE;
-- What GoTrue creates for a first "Continue with Google": identity data only.
INSERT INTO auth.users(id, email, raw_app_meta_data, raw_user_meta_data)
VALUES (pg_temp.fixture_id('oauth-auth'), 'oauth@regression.invalid',
        '{"provider": "google", "providers": ["google"]}'::jsonb,
        jsonb_build_object('full_name', 'OAuth Person', 'role', 'admin', 'org_id', pg_temp.fixture_id('org-a')));

SELECT is((SELECT org_id FROM public.profiles WHERE auth_id = pg_temp.fixture_id('oauth-auth')), NULL::uuid,
  'an OAuth account has no organization');
SELECT isnt((SELECT role::text FROM public.profiles WHERE auth_id = pg_temp.fixture_id('oauth-auth')), 'admin',
  'role claims in user_metadata are ignored');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('oauth');
SELECT is(public.current_user_org_id(), NULL::uuid, 'no org for RLS');
SELECT is((SELECT count(*)::int FROM public.courses), 0, 'sees no courses');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE auth_id <> pg_temp.fixture_id('oauth-auth')), 0,
  'cannot read any other member''s profile');

SELECT * FROM finish();
ROLLBACK;
