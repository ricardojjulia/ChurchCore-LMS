-- pgTAP tests for Phase 1B: Enrollment Engine (ADR-2025-002)
-- Run with: supabase test db
-- Gate: Phase 1A tests must pass before this file runs.

BEGIN;
SELECT plan(37);
\ir helpers/fixtures.inc

-- ============================================================
-- TABLE AND VIEW EXISTENCE
-- ============================================================
SELECT has_table('public', 'global_cohorts',            'global_cohorts table exists');
SELECT has_table('public', 'cohort_members',            'cohort_members table exists');
SELECT has_table('public', 'enrollment_jobs',           'enrollment_jobs table exists');
SELECT has_table('public', 'cohort_section_enrollments','cohort_section_enrollments table exists');
SELECT has_table('public', 'direct_enrollments',        'direct_enrollments table exists');
SELECT has_table('public', 'enrollment_audit_log',      'enrollment_audit_log table exists');
SELECT has_materialized_view( 'public', 'effective_enrollments',     'effective_enrollments materialized view exists');

-- ============================================================
-- TIMESTAMPTZ columns
-- ============================================================
SELECT col_type_is('public', 'direct_enrollments', 'enrolled_at',       'timestamp with time zone', 'direct_enrollments.enrolled_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'direct_enrollments', 'completed_at',      'timestamp with time zone', 'direct_enrollments.completed_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'direct_enrollments', 'withdrawn_at',      'timestamp with time zone', 'direct_enrollments.withdrawn_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'direct_enrollments', 'retain_data_until', 'timestamp with time zone', 'direct_enrollments.retain_data_until is TIMESTAMPTZ');
SELECT col_type_is('public', 'enrollment_audit_log', 'changed_at',      'timestamp with time zone', 'enrollment_audit_log.changed_at is TIMESTAMPTZ');

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
SELECT col_is_unique('public', 'global_cohorts',             'cohort_code',               'global_cohorts.cohort_code is unique');
SELECT col_is_unique('public', 'direct_enrollments',         ARRAY['user_id','section_id'], 'direct_enrollments (user_id, section_id) is unique');
SELECT col_is_unique('public', 'cohort_section_enrollments', ARRAY['cohort_id','section_id'], 'cohort_section_enrollments (cohort_id, section_id) is unique');

-- ============================================================
-- FUNCTION EXISTENCE
-- ============================================================
SELECT has_function('public', 'enforce_enrollment_state_machine', ARRAY[]::text[], 'state machine trigger fn exists');
SELECT has_function('public', 'lock_enrollment_source',           ARRAY[]::text[], 'source lock trigger fn exists');
SELECT has_function('public', 'refresh_effective_enrollments',    ARRAY[]::text[], 'refresh fn exists');
SELECT has_function('public', 'bulk_enroll_cohort',               ARRAY['uuid','uuid','uuid','boolean'], 'bulk_enroll_cohort fn exists');

-- ============================================================
-- STATE MACHINE: valid transitions
-- ============================================================
SAVEPOINT test_transitions;
DO $$
DECLARE
  v_section_id UUID;
  v_user_id    UUID := auth.uid();
  v_enroll_id  UUID;
BEGIN
  -- Bootstrap: need a section with an access window
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source, enrolled_by)
VALUES ( public.current_user_org_id(), v_user_id, v_section_id, 'pending', 'direct', v_user_id)
  RETURNING id INTO v_enroll_id;

  -- pending → active (valid)
  UPDATE direct_enrollments SET status = 'active' WHERE id = v_enroll_id;
  ASSERT (SELECT status FROM direct_enrollments WHERE id = v_enroll_id) = 'active',
    'pending → active transition succeeded';

  -- active → suspended (valid)
  UPDATE direct_enrollments SET status = 'suspended' WHERE id = v_enroll_id;
  ASSERT (SELECT status FROM direct_enrollments WHERE id = v_enroll_id) = 'suspended',
    'active → suspended transition succeeded';

  -- suspended → active (valid reinstatement)
  UPDATE direct_enrollments SET status = 'active' WHERE id = v_enroll_id;
  ASSERT (SELECT status FROM direct_enrollments WHERE id = v_enroll_id) = 'active',
    'suspended → active reinstatement succeeded';

  -- active → completed (valid)
  UPDATE direct_enrollments SET status = 'completed' WHERE id = v_enroll_id;
  ASSERT (SELECT completed_at FROM direct_enrollments WHERE id = v_enroll_id) IS NOT NULL,
    'completed_at timestamp set on completion';


END;
$$;
ROLLBACK TO SAVEPOINT test_transitions;

SELECT pass('state machine valid transitions test passed');

-- ============================================================
-- STATE MACHINE: invalid transitions raise exceptions
-- ============================================================
SELECT throws_ok(
  $$
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source) VALUES (current_user_org_id(), auth.uid(), pg_temp.fixture_id('section-a'), 'active', 'direct');
  UPDATE direct_enrollments SET status = 'pending' WHERE user_id = auth.uid() AND section_id = pg_temp.fixture_id('section-a')
  $$,
  'P0001',
  NULL,
  'active → pending is an invalid transition and raises exception'
);

SELECT throws_ok(
  $$
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source) VALUES (current_user_org_id(), auth.uid(), pg_temp.fixture_id('section-a'), 'pending', 'direct');
  UPDATE direct_enrollments SET status = 'suspended' WHERE user_id = auth.uid() AND section_id = pg_temp.fixture_id('section-a')
  $$,
  'P0001',
  NULL,
  'pending → suspended is invalid'
);

-- ============================================================
-- STATE MACHINE: terminal state cannot be left
-- ============================================================
SELECT throws_ok(
  $$
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source) VALUES (current_user_org_id(), auth.uid(), pg_temp.fixture_id('section-a'), 'withdrawn', 'direct');
  UPDATE direct_enrollments SET status = 'active' WHERE user_id = auth.uid() AND section_id = pg_temp.fixture_id('section-a')
  $$,
  'P0001',
  NULL,
  'withdrawn is terminal — cannot transition to active'
);

SELECT throws_ok(
  $$
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source) VALUES (current_user_org_id(), auth.uid(), pg_temp.fixture_id('section-a'), 'completed', 'direct');
  UPDATE direct_enrollments SET status = 'active' WHERE user_id = auth.uid() AND section_id = pg_temp.fixture_id('section-a')
  $$,
  'P0001',
  NULL,
  'completed is terminal — cannot transition to active'
);

-- ============================================================
-- STATE MACHINE: withdrawal sets retain_data_until = 7 years
-- ============================================================
SAVEPOINT test_retention;
DO $$
DECLARE
  v_section_id UUID;
  v_enroll_id  UUID;
  v_retain     TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source, enrolled_by)
VALUES ( public.current_user_org_id(), auth.uid(), v_section_id, 'active', 'direct', auth.uid())
  RETURNING id INTO v_enroll_id;

  UPDATE direct_enrollments SET status = 'withdrawn' WHERE id = v_enroll_id;

  SELECT retain_data_until INTO v_retain
  FROM direct_enrollments WHERE id = v_enroll_id;

  ASSERT v_retain > NOW() + INTERVAL '6 years 11 months',
    'retain_data_until is approximately 7 years from now';
  ASSERT v_retain < NOW() + INTERVAL '7 years 1 month',
    'retain_data_until is not more than 7 years + 1 month';


END;
$$;
ROLLBACK TO SAVEPOINT test_retention;

SELECT pass('withdrawal sets retain_data_until ≈ 7 years test passed');

-- ============================================================
-- STATE MACHINE: audit log populated on every transition
-- ============================================================
SAVEPOINT test_audit;
DO $$
DECLARE
  v_section_id UUID;
  v_enroll_id  UUID;
  v_audit_count INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source, enrolled_by)
VALUES ( public.current_user_org_id(), auth.uid(), v_section_id, 'pending', 'direct', auth.uid())
  RETURNING id INTO v_enroll_id;

  UPDATE direct_enrollments SET status = 'active'    WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'suspended' WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'active'    WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'withdrawn' WHERE id = v_enroll_id;

  SELECT COUNT(*) INTO v_audit_count
  FROM enrollment_audit_log WHERE enrollment_id = v_enroll_id;

  ASSERT v_audit_count = 4,
    'audit log has one entry per status transition (expected 4, got ' || v_audit_count || ')';


END;
$$;
ROLLBACK TO SAVEPOINT test_audit;

SELECT pass('audit log populated on each transition test passed');

-- ============================================================
-- SOURCE lock: source column is immutable after insert
-- ============================================================
SELECT throws_ok(
  $$
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source) VALUES (current_user_org_id(), auth.uid(), pg_temp.fixture_id('section-a'), 'pending', 'direct');
  UPDATE direct_enrollments SET source = 'api' WHERE user_id = auth.uid() AND section_id = pg_temp.fixture_id('section-a')
  $$,
  'P0001',
  NULL,
  'enrollment.source is immutable after insert'
);

-- ============================================================
-- Duplicate enrollment: ON CONFLICT means second insert is no-op
-- ============================================================
SAVEPOINT test_duplicate;
DO $$
DECLARE
  v_section_id UUID;
  v_count_before INTEGER;
  v_count_after  INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source)
VALUES ( public.current_user_org_id(), auth.uid(), v_section_id, 'pending', 'direct')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count_before
  FROM direct_enrollments WHERE user_id = auth.uid() AND section_id = v_section_id;

  -- Second insert must be a silent no-op
  INSERT INTO direct_enrollments(org_id, user_id, section_id, status, source)
VALUES ( public.current_user_org_id(), auth.uid(), v_section_id, 'active', 'cohort')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count_after
  FROM direct_enrollments WHERE user_id = auth.uid() AND section_id = v_section_id;

  ASSERT v_count_before = v_count_after,
    'duplicate enrollment is a silent no-op (ON CONFLICT DO NOTHING)';


END;
$$;
ROLLBACK TO SAVEPOINT test_duplicate;

SELECT pass('duplicate enrollment is a no-op test passed');

-- ============================================================
-- RLS POLICIES — exact policy names
-- ============================================================
SELECT policies_are('public', 'global_cohorts', ARRAY[
  'global_cohorts: managers manage own org',
  'global_cohorts: staff read own org'
], 'global_cohorts has the expected tenant policies');

SELECT policies_are('public', 'cohort_members', ARRAY[
  'cohort_members: learners read own',
  'cohort_members: managers manage own org',
  'cohort_members: staff read own org'
], 'cohort_members has the expected tenant policies');

SELECT policies_are('public', 'enrollment_jobs', ARRAY[
  'enrollment_jobs: managers manage own org',
  'enrollment_jobs: staff read own org'
], 'enrollment_jobs has the expected tenant policies');

SELECT policies_are('public', 'cohort_section_enrollments', ARRAY[
  'cohort_section_enrollments: managers manage own org',
  'cohort_section_enrollments: staff read own org'
], 'cohort_section_enrollments has the expected tenant policies');

SELECT policies_are('public', 'direct_enrollments', ARRAY[
  'direct_enrollments: learners read own',
  'direct_enrollments: managers manage own org',
  'direct_enrollments: staff read own org'
], 'direct_enrollments has the expected tenant policies');

SELECT policies_are('public', 'enrollment_audit_log', ARRAY[
  'enrollment_audit_log: managers read own org',
  'enrollment_audit_log: system insert own org'
], 'enrollment_audit_log has the expected tenant policies');

-- ============================================================
-- RLS: learner cannot UPDATE their own enrollment status
-- ============================================================
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');
SELECT results_eq($$UPDATE direct_enrollments SET status = 'withdrawn'
  WHERE user_id = auth.uid() RETURNING id$$, ARRAY[]::uuid[],
  'student cannot change their enrollment status');
SELECT is((SELECT count(*) FROM direct_enrollments WHERE user_id <> auth.uid()), 0::bigint,
  'student cannot read another student enrollment');
SELECT is((SELECT count(*) FROM direct_enrollments WHERE user_id = auth.uid()), 1::bigint,
  'student can read their own enrollment');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
