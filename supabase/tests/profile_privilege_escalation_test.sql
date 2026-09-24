-- pgTAP: 20260924100000_close_profile_privilege_escalation.sql
-- Run with: supabase test db
--
-- A signed-in user must not be able to change their own role, org, or status
-- through PostgREST, and sign-up metadata must not grant a role or tenant.

BEGIN;
SELECT plan(12);
\ir helpers/fixtures.inc

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');

-- ─── Self-promotion / tenant hopping via profiles ────────────────────────────
SELECT throws_ok(
  $$UPDATE public.profiles SET role = 'admin' WHERE uid = pg_temp.fixture_id('student-uid')$$,
  '42501', NULL, 'a user cannot set their own role'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET org_id = pg_temp.fixture_id('org-b') WHERE uid = pg_temp.fixture_id('student-uid')$$,
  '42501', NULL, 'a user cannot move themselves into another org'
);
SELECT throws_ok(
  $$UPDATE public.profiles SET status = 'active', xp_points = 999999 WHERE uid = pg_temp.fixture_id('student-uid')$$,
  '42501', NULL, 'a user cannot change their status or XP'
);
SELECT lives_ok(
  $$UPDATE public.profiles SET display_name = 'Renamed Student', timezone = 'America/New_York'
    WHERE uid = pg_temp.fixture_id('student-uid')$$,
  'a user can still edit their personal profile fields'
);

RESET ROLE;
SELECT is((SELECT role::text FROM public.profile_roles WHERE uid = pg_temp.fixture_id('student-uid')),
  'student', 'profile_roles.role is unchanged');
SELECT is((SELECT org_id FROM public.profile_roles WHERE uid = pg_temp.fixture_id('student-uid')),
  pg_temp.fixture_id('org-a'), 'profile_roles.org_id is unchanged');
SELECT is((SELECT display_name FROM public.profiles WHERE uid = pg_temp.fixture_id('student-uid')),
  'Renamed Student', 'the permitted edit was saved');

-- ─── Sign-up metadata ────────────────────────────────────────────────────────
-- What auth.signUp({ options: { data } }) can control: raw_user_meta_data.
INSERT INTO auth.users(id, email, raw_user_meta_data)
VALUES (pg_temp.fixture_id('signup-auth'), 'signup@regression.invalid',
        jsonb_build_object('role', 'admin', 'org_id', pg_temp.fixture_id('org-a'), 'display_name', 'Eve'));
SELECT is((SELECT role::text FROM public.profiles WHERE auth_id = pg_temp.fixture_id('signup-auth')),
  'student', 'self-supplied role metadata is ignored');
SELECT is((SELECT org_id FROM public.profiles WHERE auth_id = pg_temp.fixture_id('signup-auth')),
  NULL, 'self-supplied org metadata is ignored');
SELECT is((SELECT display_name FROM public.profiles WHERE auth_id = pg_temp.fixture_id('signup-auth')),
  'Eve', 'display name still comes from user metadata');

-- What only the service role can set: raw_app_meta_data.
INSERT INTO auth.users(id, email, raw_app_meta_data)
VALUES (pg_temp.fixture_id('invited-auth'), 'invited@regression.invalid',
        jsonb_build_object('role', 'teacher', 'org_id', pg_temp.fixture_id('org-a')));
SELECT is((SELECT role::text || ':' || org_id::text FROM public.profiles WHERE auth_id = pg_temp.fixture_id('invited-auth')),
  'teacher:' || pg_temp.fixture_id('org-a')::text, 'server-assigned role and org are honored');

-- GoTrue applies admin.createUser({ app_metadata }) as a follow-up UPDATE.
UPDATE auth.users SET raw_app_meta_data = jsonb_build_object('role', 'manager', 'org_id', pg_temp.fixture_id('org-b'))
WHERE id = pg_temp.fixture_id('signup-auth');
SELECT is((SELECT role::text || ':' || org_id::text FROM public.profiles WHERE auth_id = pg_temp.fixture_id('signup-auth')),
  'manager:' || pg_temp.fixture_id('org-b')::text, 'app_metadata updates propagate to the profile');

SELECT * FROM finish();
ROLLBACK;
