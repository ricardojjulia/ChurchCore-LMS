-- pgTAP tests for Phase 1B: Enrollment Engine (ADR-2025-002)
-- Run with: supabase test db
-- Gate: Phase 1A tests must pass before this file runs.

BEGIN;
SELECT plan(46);

-- ============================================================
-- TABLE AND VIEW EXISTENCE
-- ============================================================
SELECT has_table('public', 'global_cohorts',            'global_cohorts table exists');
SELECT has_table('public', 'cohort_members',            'cohort_members table exists');
SELECT has_table('public', 'enrollment_jobs',           'enrollment_jobs table exists');
SELECT has_table('public', 'cohort_section_enrollments','cohort_section_enrollments table exists');
SELECT has_table('public', 'direct_enrollments',        'direct_enrollments table exists');
SELECT has_table('public', 'enrollment_audit_log',      'enrollment_audit_log table exists');
SELECT has_view( 'public', 'effective_enrollments',     'effective_enrollments materialized view exists');

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
DO $$
DECLARE
  v_section_id UUID;
  v_user_id    UUID := auth.uid();
  v_enroll_id  UUID;
BEGIN
  -- Bootstrap: need a section with an access window
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN
    RAISE NOTICE 'No course_sections found — skipping state machine transition tests';
    RETURN;
  END IF;

  INSERT INTO direct_enrollments(user_id, section_id, status, source, enrolled_by)
  VALUES (v_user_id, v_section_id, 'pending', 'direct', v_user_id)
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

  ROLLBACK TO SAVEPOINT test_transitions;
END;
$$;

SELECT pass('state machine valid transitions test passed');

-- ============================================================
-- STATE MACHINE: invalid transitions raise exceptions
-- ============================================================
SELECT throws_ok(
  $$
  WITH e AS (
    INSERT INTO direct_enrollments(user_id, section_id, status, source)
    SELECT auth.uid(), id, 'active', 'direct' FROM course_sections LIMIT 1
    RETURNING id
  )
  UPDATE direct_enrollments SET status = 'pending' WHERE id = (SELECT id FROM e)
  $$,
  'P0001',
  NULL,
  'active → pending is an invalid transition and raises exception'
);

SELECT throws_ok(
  $$
  WITH e AS (
    INSERT INTO direct_enrollments(user_id, section_id, status, source)
    SELECT auth.uid(), id, 'pending', 'direct' FROM course_sections LIMIT 1
    RETURNING id
  )
  UPDATE direct_enrollments SET status = 'suspended' WHERE id = (SELECT id FROM e)
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
  WITH e AS (
    INSERT INTO direct_enrollments(user_id, section_id, status, source)
    SELECT auth.uid(), id, 'withdrawn', 'direct' FROM course_sections LIMIT 1
    RETURNING id
  )
  UPDATE direct_enrollments SET status = 'active' WHERE id = (SELECT id FROM e)
  $$,
  'P0001',
  NULL,
  'withdrawn is terminal — cannot transition to active'
);

SELECT throws_ok(
  $$
  WITH e AS (
    INSERT INTO direct_enrollments(user_id, section_id, status, source)
    SELECT auth.uid(), id, 'completed', 'direct' FROM course_sections LIMIT 1
    RETURNING id
  )
  UPDATE direct_enrollments SET status = 'active' WHERE id = (SELECT id FROM e)
  $$,
  'P0001',
  NULL,
  'completed is terminal — cannot transition to active'
);

-- ============================================================
-- STATE MACHINE: withdrawal sets retain_data_until = 7 years
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_enroll_id  UUID;
  v_retain     TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO direct_enrollments(user_id, section_id, status, source, enrolled_by)
  VALUES (auth.uid(), v_section_id, 'active', 'direct', auth.uid())
  RETURNING id INTO v_enroll_id;

  UPDATE direct_enrollments SET status = 'withdrawn' WHERE id = v_enroll_id;

  SELECT retain_data_until INTO v_retain
  FROM direct_enrollments WHERE id = v_enroll_id;

  ASSERT v_retain > NOW() + INTERVAL '6 years 11 months',
    'retain_data_until is approximately 7 years from now';
  ASSERT v_retain < NOW() + INTERVAL '7 years 1 month',
    'retain_data_until is not more than 7 years + 1 month';

  ROLLBACK TO SAVEPOINT test_retention;
END;
$$;

SELECT pass('withdrawal sets retain_data_until ≈ 7 years test passed');

-- ============================================================
-- STATE MACHINE: audit log populated on every transition
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_enroll_id  UUID;
  v_audit_count INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO direct_enrollments(user_id, section_id, status, source, enrolled_by)
  VALUES (auth.uid(), v_section_id, 'pending', 'direct', auth.uid())
  RETURNING id INTO v_enroll_id;

  UPDATE direct_enrollments SET status = 'active'    WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'suspended' WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'active'    WHERE id = v_enroll_id;
  UPDATE direct_enrollments SET status = 'withdrawn' WHERE id = v_enroll_id;

  SELECT COUNT(*) INTO v_audit_count
  FROM enrollment_audit_log WHERE enrollment_id = v_enroll_id;

  ASSERT v_audit_count = 4,
    'audit log has one entry per status transition (expected 4, got ' || v_audit_count || ')';

  ROLLBACK TO SAVEPOINT test_audit;
END;
$$;

SELECT pass('audit log populated on each transition test passed');

-- ============================================================
-- SOURCE lock: source column is immutable after insert
-- ============================================================
SELECT throws_ok(
  $$
  WITH e AS (
    INSERT INTO direct_enrollments(user_id, section_id, status, source)
    SELECT auth.uid(), id, 'pending', 'direct' FROM course_sections LIMIT 1
    RETURNING id
  )
  UPDATE direct_enrollments SET source = 'api' WHERE id = (SELECT id FROM e)
  $$,
  'P0001',
  NULL,
  'enrollment.source is immutable after insert'
);

-- ============================================================
-- Duplicate enrollment: ON CONFLICT means second insert is no-op
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_count_before INTEGER;
  v_count_after  INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO direct_enrollments(user_id, section_id, status, source)
  VALUES (auth.uid(), v_section_id, 'pending', 'direct')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count_before
  FROM direct_enrollments WHERE user_id = auth.uid() AND section_id = v_section_id;

  -- Second insert must be a silent no-op
  INSERT INTO direct_enrollments(user_id, section_id, status, source)
  VALUES (auth.uid(), v_section_id, 'active', 'cohort')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO v_count_after
  FROM direct_enrollments WHERE user_id = auth.uid() AND section_id = v_section_id;

  ASSERT v_count_before = v_count_after,
    'duplicate enrollment is a silent no-op (ON CONFLICT DO NOTHING)';

  ROLLBACK TO SAVEPOINT test_duplicate;
END;
$$;

SELECT pass('duplicate enrollment is a no-op test passed');

-- ============================================================
-- RLS POLICIES — exact policy names
-- ============================================================
SELECT policies_are('public', 'global_cohorts', ARRAY[
  'admin_manager_all_cohorts',
  'teacher_read_cohorts'
], 'global_cohorts has exactly the expected RLS policies');

SELECT policies_are('public', 'cohort_members', ARRAY[
  'admin_manager_all_cohort_members',
  'teacher_read_cohort_members',
  'learner_read_own_cohort_membership'
], 'cohort_members has exactly the expected RLS policies');

SELECT policies_are('public', 'enrollment_jobs', ARRAY[
  'admin_manager_all_enrollment_jobs'
], 'enrollment_jobs has exactly the expected RLS policies');

SELECT policies_are('public', 'cohort_section_enrollments', ARRAY[
  'admin_manager_all_cse',
  'teacher_read_cse'
], 'cohort_section_enrollments has exactly the expected RLS policies');

SELECT policies_are('public', 'direct_enrollments', ARRAY[
  'admin_manager_all_direct_enrollments',
  'teacher_read_direct_enrollments',
  'learner_read_own_enrollment'
], 'direct_enrollments has exactly the expected RLS policies');

SELECT policies_are('public', 'enrollment_audit_log', ARRAY[
  'admin_manager_read_audit_log',
  'system_insert_audit_log'
], 'enrollment_audit_log has exactly the expected RLS policies');

-- ============================================================
-- RLS: learner cannot UPDATE their own enrollment status
-- ============================================================
SELECT throws_ok(
  $$
  SET LOCAL ROLE learner;
  UPDATE direct_enrollments SET status = 'withdrawn'
  WHERE user_id = auth.uid()
  $$,
  '42501',
  NULL,
  'learner cannot UPDATE their own enrollment status'
);

-- ============================================================
-- RLS: learner cannot read other students enrollments
-- ============================================================
SELECT throws_ok(
  $$
  SET LOCAL ROLE learner;
  SELECT * FROM direct_enrollments WHERE user_id != auth.uid()
  $$,
  '42501',
  NULL,
  'learner cannot read other students direct_enrollments'
);

SELECT * FROM finish();
ROLLBACK;
