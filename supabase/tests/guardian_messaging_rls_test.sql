-- pgTAP: teacher ↔ guardian messaging and the thread self-join fix
-- (COUNCIL-2026-035, migration 20260926140000_guardian_messaging.sql)
-- Run with: supabase test db

BEGIN;
SELECT plan(14);
\ir helpers/fixtures.inc

-- Extra actors: a linked guardian, an unlinked guardian, and a teacher who
-- doesn't teach the student.
RESET ROLE;
INSERT INTO auth.users(id, email, raw_app_meta_data)
SELECT pg_temp.fixture_id(name || '-auth'), name || '@regression.invalid',
  jsonb_build_object('org_id', pg_temp.fixture_id('org-a'), 'role', role)
FROM (VALUES ('guardian', 'guardian'), ('guardian2', 'guardian'), ('teacher2', 'teacher')) AS u(name, role);
UPDATE public.profiles SET uid = pg_temp.fixture_id(split_part(email, '@', 1) || '-uid'), status = 'active'
WHERE email IN ('guardian@regression.invalid', 'guardian2@regression.invalid', 'teacher2@regression.invalid');
INSERT INTO public.guardian_links (guardian_uid, student_uid, created_by, org_id)
VALUES (pg_temp.fixture_id('guardian-uid'), pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('admin-uid'), pg_temp.fixture_id('org-a'));

SET LOCAL ROLE authenticated;

-- ── Allowed and denied pairs ─────────────────────────────────────────────────
SELECT pg_temp.actor('guardian');
SELECT ok(public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('teacher-uid')),
  'a linked guardian may message the student''s teacher');
SELECT ok(public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('admin-uid')),
  'a linked guardian may message an org admin');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('teacher2-uid')),
  'a linked guardian may not message a teacher who doesn''t teach the student');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('student-uid')),
  'a guardian may not message the student through a guardian thread');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('guardian2-uid')),
  'a guardian may not message another guardian');

SELECT pg_temp.actor('teacher');
SELECT ok(public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('guardian-uid')),
  'the student''s teacher may message the linked guardian');

SELECT pg_temp.actor('teacher2');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('guardian-uid')),
  'an unrelated teacher may not message the guardian');

SELECT pg_temp.actor('guardian2');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('teacher-uid')),
  'an unlinked guardian may not message about the student');

SELECT pg_temp.actor('admin-b');
SELECT ok(NOT public.can_message_about(pg_temp.fixture_id('student-uid'), pg_temp.fixture_id('guardian-uid')),
  'another org''s admin may not message about the student');

-- ── A thread about the student, and the read-only rule after unlinking ──────
RESET ROLE;
INSERT INTO public.message_threads (id, thread_type, created_by, org_id, subject_student_uid)
VALUES (pg_temp.fixture_id('g-thread'), 'direct', pg_temp.fixture_id('guardian-uid'), pg_temp.fixture_id('org-a'), pg_temp.fixture_id('student-uid'));
INSERT INTO public.message_thread_participants (thread_id, user_id, role, org_id)
VALUES (pg_temp.fixture_id('g-thread'), pg_temp.fixture_id('guardian-uid'), 'owner', pg_temp.fixture_id('org-a')),
       (pg_temp.fixture_id('g-thread'), pg_temp.fixture_id('teacher-uid'), 'member', pg_temp.fixture_id('org-a'));

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('guardian');
SELECT lives_ok(
  $$INSERT INTO public.messages (thread_id, sender_id, body, org_id)
    VALUES (pg_temp.fixture_id('g-thread'), pg_temp.fixture_id('guardian-uid'), 'How is she doing?', pg_temp.fixture_id('org-a'))$$,
  'the guardian can post while linked');

RESET ROLE;
DELETE FROM public.guardian_links WHERE guardian_uid = pg_temp.fixture_id('guardian-uid');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('guardian');
SELECT throws_ok(
  $$INSERT INTO public.messages (thread_id, sender_id, body, org_id)
    VALUES (pg_temp.fixture_id('g-thread'), pg_temp.fixture_id('guardian-uid'), 'still there?', pg_temp.fixture_id('org-a'))$$,
  '42501', NULL, 'after the link is removed the thread is read-only for the guardian');
SELECT is((SELECT count(*)::int FROM public.messages WHERE thread_id = pg_temp.fixture_id('g-thread')), 1,
  'the history stays readable');

-- ── Amendment 5: nobody can self-join a thread or spoof its creator ─────────
SELECT pg_temp.actor('nonmember');
SELECT throws_ok(
  $$INSERT INTO public.message_thread_participants (thread_id, user_id, role, org_id)
    VALUES (pg_temp.fixture_id('g-thread'), pg_temp.fixture_id('nonmember-uid'), 'member', pg_temp.fixture_id('org-a'))$$,
  '42501', NULL, 'an org member cannot add themselves to someone else''s thread');
SELECT throws_ok(
  $$INSERT INTO public.message_threads (thread_type, created_by, org_id)
    VALUES ('direct', pg_temp.fixture_id('teacher-uid'), pg_temp.fixture_id('org-a'))$$,
  '42501', NULL, 'users cannot create threads directly (or name another creator)');

SELECT * FROM finish();
ROLLBACK;
