-- pgTAP: survey anonymity and checklist ownership (COUNCIL-2026-044,
-- migration 20260926120000_survey_checklist_flashcards.sql)
-- Run with: supabase test db

BEGIN;
SELECT plan(12);
\ir helpers/fixtures.inc

RESET ROLE;
INSERT INTO public.course_blocks (id, course_id, org_id, block_type_id, title, sort_order, is_published, content)
VALUES
  (pg_temp.fixture_id('survey-anon'), pg_temp.fixture_id('course-a'), pg_temp.fixture_id('org-a'),
   'survey', 'Anonymous survey', 1, true, '{"anonymous": true, "questions": []}'),
  (pg_temp.fixture_id('survey-named'), pg_temp.fixture_id('course-a'), pg_temp.fixture_id('org-a'),
   'survey', 'Named survey', 2, true, '{"anonymous": false, "questions": []}'),
  (pg_temp.fixture_id('checklist'), pg_temp.fixture_id('course-a'), pg_temp.fixture_id('org-a'),
   'checklist', 'Next steps', 3, true, '{"items": []}');

SELECT ok(NOT EXISTS (SELECT 1 FROM public.block_types WHERE id IN ('section', 'certificate')),
  'section and certificate placeholders are removed');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');

SELECT lives_ok($$SELECT public.submit_survey(pg_temp.fixture_id('survey-anon'), '{"q1": 5}')$$,
  'an enrolled learner can answer an anonymous survey');
SELECT throws_ok($$SELECT public.submit_survey(pg_temp.fixture_id('survey-anon'), '{"q1": 4}')$$,
  '23505', NULL, 'a second response is rejected');
SELECT lives_ok($$SELECT public.submit_survey(pg_temp.fixture_id('survey-named'), '{"q1": 3}')$$,
  'an enrolled learner can answer a named survey');

SELECT lives_ok(
  $$INSERT INTO public.checklist_progress (block_id, checked) VALUES (pg_temp.fixture_id('checklist'), '["a"]')$$,
  'a learner saves their own checklist progress');

SELECT pg_temp.actor('student-b');
SELECT throws_ok($$SELECT public.submit_survey(pg_temp.fixture_id('survey-anon'), '{"q1": 1}')$$,
  '42501', NULL, 'a learner from another org cannot respond');
SELECT is((SELECT count(*)::int FROM public.checklist_progress), 0,
  'another org cannot read checklist progress');

RESET ROLE;
SELECT is((SELECT respondent_uid FROM public.survey_responses WHERE block_id = pg_temp.fixture_id('survey-anon')),
  NULL::uuid, 'anonymous responses carry no respondent uid');
SELECT is((SELECT created_at FROM public.survey_responses WHERE block_id = pg_temp.fixture_id('survey-anon')),
  date_trunc('day', now()), 'anonymous response timestamps are truncated to the day');
SELECT is((SELECT respondent_uid FROM public.survey_responses WHERE block_id = pg_temp.fixture_id('survey-named')),
  pg_temp.fixture_id('student-uid'), 'named responses record the respondent server-side');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');
SELECT is((SELECT count(*)::int FROM public.survey_responses), 0, 'learners cannot read survey responses');

RESET ROLE;
SELECT throws_ok(
  $$UPDATE public.course_blocks SET content = '{"anonymous": false, "questions": []}' WHERE id = pg_temp.fixture_id('survey-anon')$$,
  '42501', NULL, 'anonymity is locked once responses exist');

SELECT * FROM finish();
ROLLBACK;
