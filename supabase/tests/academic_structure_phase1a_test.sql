-- pgTAP tests for Phase 1A: Academic Structure (ADR-2025-002)
-- Run with: supabase test db

BEGIN;
SELECT plan(52);

-- ============================================================
-- TABLE EXISTENCE
-- ============================================================
SELECT has_table('public', 'program_tracks',       'program_tracks table exists');
SELECT has_table('public', 'academic_terms',       'academic_terms table exists');
SELECT has_table('public', 'course_blueprints',    'course_blueprints table exists');
SELECT has_table('public', 'course_sections',      'course_sections table exists');
SELECT has_table('public', 'access_windows',       'access_windows table exists');
SELECT has_table('public', 'meeting_schedules',    'meeting_schedules table exists');

-- ============================================================
-- COLUMN TYPES — all timestamps must be TIMESTAMPTZ
-- ============================================================
SELECT col_type_is('public', 'academic_terms',  'created_at',  'timestamp with time zone', 'academic_terms.created_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'academic_terms',  'updated_at',  'timestamp with time zone', 'academic_terms.updated_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'course_sections', 'created_at',  'timestamp with time zone', 'course_sections.created_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'course_sections', 'updated_at',  'timestamp with time zone', 'course_sections.updated_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'access_windows',  'start_date',  'timestamp with time zone', 'access_windows.start_date is TIMESTAMPTZ');
SELECT col_type_is('public', 'access_windows',  'end_date',    'timestamp with time zone', 'access_windows.end_date is TIMESTAMPTZ');

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
SELECT col_is_unique('public', 'program_tracks',    'code',      'program_tracks.code is unique');
SELECT col_is_unique('public', 'academic_terms',    'term_code', 'academic_terms.term_code is unique');
SELECT col_is_unique('public', 'course_blueprints', 'course_code', 'course_blueprints.course_code is unique');
SELECT col_is_unique('public', 'access_windows',    'section_id', 'access_windows.section_id is unique (one window per section)');

-- ============================================================
-- CHECK CONSTRAINTS
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO access_windows(section_id, start_date, end_date)
    SELECT gen_random_uuid(), NOW() + INTERVAL '1 day', NOW()$$,
  'P0001',
  NULL,
  'access_windows rejects end_date <= start_date'
);

SELECT throws_ok(
  $$INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date, created_by)
    VALUES ('Bad', 'BAD-001', 'semester', '2025-06-01', '2025-05-01', auth.uid())$$,
  'P0001',
  NULL,
  'academic_terms rejects end_date <= start_date'
);

SELECT throws_ok(
  $$INSERT INTO course_sections(blueprint_id, term_id, section_code, delivery_format, created_by)
    VALUES (gen_random_uuid(), gen_random_uuid(), 'S01', 'lecture', auth.uid())$$,
  '23514',
  NULL,
  'course_sections rejects invalid delivery_format'
);

-- ============================================================
-- FUNCTION EXISTENCE
-- ============================================================
SELECT has_function('public', 'resolve_term_config',          ARRAY['uuid'], 'resolve_term_config(uuid) exists');
SELECT has_function('public', 'check_section_access',         ARRAY['uuid'], 'check_section_access(uuid) exists');
SELECT has_function('public', 'compute_term_depth',           ARRAY[]::text[], 'compute_term_depth() trigger fn exists');
SELECT has_function('public', 'normalize_meeting_schedule_utc', ARRAY[]::text[], 'normalize_meeting_schedule_utc() trigger fn exists');

-- ============================================================
-- resolve_term_config: child overrides parent
-- ============================================================
DO $$
DECLARE
  v_parent_id UUID;
  v_child_id  UUID;
  v_result    JSONB;
BEGIN
  -- Insert parent term
  INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date, config, created_by)
  VALUES ('Parent Term', 'TEST-PARENT-001', 'academic_year', '2025-01-01', '2025-12-31',
          '{"max_extensions": 2, "late_policy": "strict"}', auth.uid())
  RETURNING id INTO v_parent_id;

  -- Insert child term overriding late_policy only
  INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date,
                              config, parent_term_id, created_by)
  VALUES ('Child Term', 'TEST-CHILD-001', 'semester', '2025-01-01', '2025-06-30',
          '{"late_policy": "lenient"}', v_parent_id, auth.uid())
  RETURNING id INTO v_child_id;

  v_result := resolve_term_config(v_child_id);

  -- Child overrides parent's late_policy; inherits max_extensions
  ASSERT (v_result->>'late_policy') = 'lenient',
    'child config overrides parent: late_policy should be lenient';
  ASSERT (v_result->>'max_extensions') = '2',
    'child inherits parent config: max_extensions should be 2';

  ROLLBACK TO SAVEPOINT test_resolve;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

SELECT pass('resolve_term_config child-overrides-parent test passed');

-- ============================================================
-- resolve_term_config: missing key falls back to parent
-- ============================================================
DO $$
DECLARE
  v_parent_id UUID;
  v_child_id  UUID;
  v_result    JSONB;
BEGIN
  INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date, config, created_by)
  VALUES ('P2', 'TEST-PARENT-002', 'academic_year', '2025-01-01', '2025-12-31',
          '{"grace_days": 3}', auth.uid())
  RETURNING id INTO v_parent_id;

  INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date,
                              config, parent_term_id, created_by)
  VALUES ('C2', 'TEST-CHILD-002', 'semester', '2025-01-01', '2025-06-30',
          '{}', v_parent_id, auth.uid())
  RETURNING id INTO v_child_id;

  v_result := resolve_term_config(v_child_id);

  ASSERT (v_result->>'grace_days') = '3',
    'missing key in child falls back to parent value';

  ROLLBACK TO SAVEPOINT test_fallback;
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

SELECT pass('resolve_term_config missing-key fallback test passed');

-- ============================================================
-- check_section_access: open window returns TRUE
-- ============================================================
SELECT is(
  (SELECT check_section_access(aw.section_id)
   FROM access_windows aw
   WHERE aw.start_date <= NOW() AND aw.end_date >= NOW()
   LIMIT 1),
  TRUE,
  'check_section_access returns TRUE within open window'
);

-- ============================================================
-- check_section_access: future window returns FALSE
-- ============================================================
SELECT is(
  (SELECT check_section_access(aw.section_id)
   FROM access_windows aw
   WHERE aw.start_date > NOW()
   LIMIT 1),
  FALSE,
  'check_section_access returns FALSE for future window'
);

-- ============================================================
-- check_section_access: grace period extends access
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_result BOOLEAN;
BEGIN
  -- Create a blueprint and term for FK integrity
  INSERT INTO course_blueprints(course_code, title, created_by)
  VALUES ('TEST-BP-GRACE', 'Test Blueprint', auth.uid());

  INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date, created_by)
  VALUES ('Grace Test Term', 'TEST-GRACE-TERM', 'semester', '2025-01-01', '2025-06-30', auth.uid());

  INSERT INTO course_sections(blueprint_id, term_id, section_code, delivery_format, created_by)
  SELECT b.id, t.id, 'G01', 'asynchronous', auth.uid()
  FROM course_blueprints b, academic_terms t
  WHERE b.course_code = 'TEST-BP-GRACE' AND t.term_code = 'TEST-GRACE-TERM'
  RETURNING id INTO v_section_id;

  -- Window ended 2 days ago, grace_days = 5 → still accessible
  INSERT INTO access_windows(section_id, start_date, end_date, grace_days)
  VALUES (v_section_id, NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days', 5);

  v_result := check_section_access(v_section_id);
  ASSERT v_result = TRUE, 'grace period: window ended 2 days ago, grace 5 days → should be TRUE';

  ROLLBACK TO SAVEPOINT test_grace;
END;
$$;

SELECT pass('check_section_access grace period test passed');

-- ============================================================
-- Depth enforcement: max depth 4
-- ============================================================
SELECT throws_ok(
  $$
  WITH t AS (
    INSERT INTO academic_terms(term_name, term_code, type, start_date, end_date, depth, created_by)
    VALUES ('Deep', 'TEST-DEEP-001', 'block', '2025-01-01', '2025-12-31', 5, auth.uid())
    RETURNING id
  )
  SELECT id FROM t
  $$,
  '23514',
  NULL,
  'academic_terms rejects depth > 4'
);

-- ============================================================
-- meeting_schedules: rejected for asynchronous sections
-- ============================================================
SELECT throws_ok(
  $$
  WITH s AS (
    SELECT id FROM course_sections WHERE delivery_format = 'asynchronous' LIMIT 1
  )
  INSERT INTO meeting_schedules(section_id, start_time, end_time, effective_from, timezone)
  SELECT id, '09:00', '10:00', CURRENT_DATE, 'America/New_York' FROM s
  $$,
  'P0001',
  NULL,
  'meeting_schedules rejected for asynchronous section'
);

-- ============================================================
-- RLS POLICIES — exact policy names
-- ============================================================
SELECT policies_are('public', 'program_tracks', ARRAY[
  'admin_manager_all_program_tracks',
  'authenticated_read_active_program_tracks'
], 'program_tracks has exactly the expected RLS policies');

SELECT policies_are('public', 'academic_terms', ARRAY[
  'admin_manager_all_academic_terms',
  'authenticated_read_active_academic_terms'
], 'academic_terms has exactly the expected RLS policies');

SELECT policies_are('public', 'course_blueprints', ARRAY[
  'admin_manager_all_blueprints',
  'teacher_read_blueprints',
  'learner_read_active_blueprints'
], 'course_blueprints has exactly the expected RLS policies');

SELECT policies_are('public', 'course_sections', ARRAY[
  'admin_manager_all_sections',
  'teacher_read_sections',
  'learner_read_active_sections'
], 'course_sections has exactly the expected RLS policies');

SELECT policies_are('public', 'access_windows', ARRAY[
  'admin_manager_all_access_windows',
  'teacher_read_access_windows'
], 'access_windows has exactly the expected RLS policies (no learner direct read)');

SELECT policies_are('public', 'meeting_schedules', ARRAY[
  'admin_manager_all_meeting_schedules',
  'teacher_read_meeting_schedules',
  'learner_read_meeting_schedules'
], 'meeting_schedules has exactly the expected RLS policies');

-- ============================================================
-- RLS: learner cannot read access_windows directly
-- ============================================================
SELECT throws_ok(
  $$
  SET LOCAL ROLE learner;
  SELECT * FROM access_windows LIMIT 1;
  $$,
  '42501',
  NULL,
  'learner role cannot SELECT from access_windows directly'
);

SELECT * FROM finish();
ROLLBACK;
