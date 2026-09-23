-- pgTAP: messaging RLS (20260923200000_fix_messaging_rls_recursion.sql)
-- Run with: supabase test db
--
-- Regression for two defects found by the COUNCIL-2026-031 page sweep:
--   1. self-referencing SELECT policies on message_thread_participants raised
--      42P17 (infinite recursion) on every read, so no thread could open;
--   2. messages INSERT did not require thread membership.

BEGIN;
SELECT plan(11);
\ir helpers/fixtures.inc

-- Thread between teacher and student in Org A (inserted as the table owner).
RESET ROLE;
INSERT INTO public.message_threads (id, thread_type, subject, created_by, org_id)
VALUES (pg_temp.fixture_id('thread'), 'direct', 'Regression thread',
        pg_temp.fixture_id('teacher-uid'), pg_temp.fixture_id('org-a'));
INSERT INTO public.message_thread_participants (thread_id, user_id, role, org_id)
VALUES (pg_temp.fixture_id('thread'), pg_temp.fixture_id('teacher-uid'), 'owner',  pg_temp.fixture_id('org-a')),
       (pg_temp.fixture_id('thread'), pg_temp.fixture_id('student-uid'), 'member', pg_temp.fixture_id('org-a'));
INSERT INTO public.messages (thread_id, sender_id, body, org_id)
VALUES (pg_temp.fixture_id('thread'), pg_temp.fixture_id('teacher-uid'), 'hello', pg_temp.fixture_id('org-a'));

-- ─── Participant ─────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');

SELECT lives_ok(
  $$SELECT count(*) FROM public.message_thread_participants$$,
  'reading message_thread_participants no longer raises infinite recursion'
);
SELECT is((SELECT count(*)::int FROM public.message_thread_participants WHERE thread_id = pg_temp.fixture_id('thread')),
  2, 'participant sees both participants of their thread');
SELECT is((SELECT count(*)::int FROM public.message_threads WHERE id = pg_temp.fixture_id('thread')),
  1, 'participant sees the thread');
SELECT is((SELECT count(*)::int FROM public.messages WHERE thread_id = pg_temp.fixture_id('thread')),
  1, 'participant sees the thread''s messages');
SELECT lives_ok(
  $$INSERT INTO public.messages (thread_id, sender_id, body, org_id)
    VALUES (pg_temp.fixture_id('thread'), pg_temp.fixture_id('student-uid'), 'reply', pg_temp.fixture_id('org-a'))$$,
  'participant can post to their thread'
);

-- ─── Same-org non-participant ────────────────────────────────────────────────
SELECT pg_temp.actor('nonmember');

SELECT is((SELECT count(*)::int FROM public.message_thread_participants WHERE thread_id = pg_temp.fixture_id('thread')),
  0, 'same-org non-participant sees no participants');
SELECT is((SELECT count(*)::int FROM public.messages WHERE thread_id = pg_temp.fixture_id('thread')),
  0, 'same-org non-participant sees no messages');
SELECT throws_ok(
  $$INSERT INTO public.messages (thread_id, sender_id, body, org_id)
    VALUES (pg_temp.fixture_id('thread'), pg_temp.fixture_id('nonmember-uid'), 'intrusion', pg_temp.fixture_id('org-a'))$$,
  '42501', NULL,
  'same-org non-participant cannot post into someone else''s thread'
);

-- ─── Other org ───────────────────────────────────────────────────────────────
SELECT pg_temp.actor('admin-b');

SELECT is((SELECT count(*)::int FROM public.message_threads WHERE id = pg_temp.fixture_id('thread')),
  0, 'other-org admin cannot see the thread');
SELECT is((SELECT count(*)::int FROM public.messages WHERE thread_id = pg_temp.fixture_id('thread')),
  0, 'other-org admin cannot see its messages');
SELECT throws_ok(
  $$INSERT INTO public.messages (thread_id, sender_id, body, org_id)
    VALUES (pg_temp.fixture_id('thread'), pg_temp.fixture_id('admin-b-uid'), 'cross-tenant', pg_temp.fixture_id('org-a'))$$,
  '42501', NULL,
  'other-org admin cannot post into the thread'
);

SELECT * FROM finish();
ROLLBACK;
