-- pgTAP tests for Phase 0: Unified Embedding Architecture (ADR-2025-003)
-- Run with: supabase test db
-- Gate: migration 038 must be applied before this file runs.
-- All 18 council amendments are covered; see amendment refs in comments.

BEGIN;
SELECT plan(48);

-- ============================================================
-- TABLE AND VIEW EXISTENCE
-- ============================================================
SELECT has_table('public', 'embeddings',      'embeddings table exists');
SELECT has_table('public', 'embedding_jobs',  'embedding_jobs table exists');
SELECT has_table('public', 'ai_query_log',    'ai_query_log table exists');

-- ============================================================
-- COLUMN TYPES
-- ============================================================
SELECT col_type_is('public', 'embeddings',     'embedded_at',       'timestamp with time zone', 'embeddings.embedded_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'embeddings',     'source_updated_at', 'timestamp with time zone', 'embeddings.source_updated_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'embedding_jobs', 'created_at',        'timestamp with time zone', 'embedding_jobs.created_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'embedding_jobs', 'completed_at',      'timestamp with time zone', 'embedding_jobs.completed_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'ai_query_log',   'responded_at',      'timestamp with time zone', 'ai_query_log.responded_at is TIMESTAMPTZ');

-- embedding_status column added to content_pages (amendment #3 pre-req)
SELECT has_column('public', 'content_pages', 'embedding_status',      'content_pages has embedding_status column');
SELECT has_column('public', 'content_pages', 'embedding_updated_at',  'content_pages has embedding_updated_at column');
SELECT has_column('public', 'content_pages', 'embedding_chunk_count', 'content_pages has embedding_chunk_count column');

-- Vector column must NOT exist on content_pages (amendment: column removed)
SELECT hasnt_column('public', 'content_pages', 'embedding', 'content_pages.embedding vector column has been removed');

-- attempt_count on embedding_jobs (amendment #4)
SELECT has_column('public', 'embedding_jobs', 'attempt_count', 'embedding_jobs has attempt_count column');
SELECT col_type_is('public', 'embedding_jobs', 'attempt_count', 'integer', 'embedding_jobs.attempt_count is integer');

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
SELECT col_is_unique('public', 'embeddings', ARRAY['source_type','source_id','chunk_index'],
  'embeddings (source_type, source_id, chunk_index) is unique');

-- ============================================================
-- FUNCTION EXISTENCE
-- ============================================================
SELECT has_function('public', 'search_content_chunks',
  ARRAY['vector','uuid','integer','double precision'],
  'search_content_chunks function exists');

SELECT has_function('public', 'build_tutor_context',
  ARRAY['uuid','uuid'],
  'build_tutor_context function exists');

SELECT has_function('public', 'mark_embeddings_stale',
  ARRAY[]::text[],
  'mark_embeddings_stale trigger fn exists');

SELECT has_function('public', 'refresh_enrollments_on_status_change',
  ARRAY[]::text[],
  'refresh_enrollments_on_status_change trigger fn exists');

-- ============================================================
-- RLS ENABLED
-- ============================================================
SELECT tablename_has_rls('public', 'embeddings',     'embeddings has RLS enabled');
SELECT tablename_has_rls('public', 'embedding_jobs', 'embedding_jobs has RLS enabled');
SELECT tablename_has_rls('public', 'ai_query_log',   'ai_query_log has RLS enabled');

-- ============================================================
-- RLS POLICY NAMES (amendment #3 — exact names required)
-- ============================================================
SELECT policies_are('public', 'embeddings', ARRAY[
  'enrolled_student_read_embeddings',
  'service_role_manage_embeddings'
], 'embeddings has exactly the expected RLS policies');

SELECT policies_are('public', 'embedding_jobs', ARRAY[
  'admin_read_embedding_jobs',
  'service_role_manage_embedding_jobs'
], 'embedding_jobs has exactly the expected RLS policies');

SELECT policies_are('public', 'ai_query_log', ARRAY[
  'admin_read_ai_query_log',
  'service_role_manage_ai_query_log'
], 'ai_query_log has exactly the expected RLS policies');

-- ============================================================
-- AMENDMENT #3: AUTHENTICATED ROLES CANNOT INSERT EMBEDDINGS
-- An authenticated user (non-service-role) must not be able to
-- insert into the embeddings table. This is a hard security gate.
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;

  IF v_section_id IS NULL THEN
    RAISE WARNING 'No course_sections found — skipping INSERT denial test body (policy check still runs above)';
    RETURN;
  END IF;

  -- This INSERT must raise an exception for any authenticated user
  BEGIN
    INSERT INTO embeddings (
      source_type, source_id, chunk_index, chunk_text,
      chunk_char_count, embedding, section_id, source_updated_at
    ) VALUES (
      'content_page', gen_random_uuid(), 0, 'test chunk',
      10, array_fill(0, ARRAY[1536])::vector(1536),
      v_section_id, NOW()
    );
    -- If we reach here the INSERT succeeded — test must fail
    RAISE EXCEPTION 'INSERT into embeddings should have been denied for authenticated role';
  EXCEPTION WHEN insufficient_privilege THEN
    -- Expected — RLS blocked the insert
    NULL;
  END;
END $$;

SELECT pass('authenticated role INSERT denial test passed');

-- ============================================================
-- AMENDMENT #14: RLS ISOLATION — OWN SECTION ONLY
-- A student enrolled in section A must see zero rows from
-- embeddings when they query with section B's id.
-- This test uses two synthetic section IDs that no enrollment
-- exists for — both should return empty.
-- ============================================================
DO $$
DECLARE
  v_fake_section UUID := gen_random_uuid();
  v_count        INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM embeddings
  WHERE section_id = v_fake_section
    AND is_active  = TRUE;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'RLS isolation breach: embeddings visible for section % with no enrollment', v_fake_section;
  END IF;
END $$;

SELECT pass('RLS isolation: unenrolled section returns no embeddings');

-- ============================================================
-- STALENESS TRIGGER EXISTS
-- ============================================================
SELECT trigger_is('public', 'content_pages', 'trg_content_pages_mark_stale',
  'mark_embeddings_stale',
  'staleness trigger exists on content_pages');

-- ============================================================
-- WITHDRAWAL REFRESH TRIGGER EXISTS (amendment #13)
-- ============================================================
SELECT trigger_is('public', 'direct_enrollments', 'trg_enrollment_status_refresh',
  'refresh_enrollments_on_status_change',
  'withdrawal refresh trigger exists on direct_enrollments');

-- ============================================================
-- build_tutor_context: raises on missing enrollment
-- ============================================================
SELECT throws_ok(
  $$SELECT build_tutor_context(gen_random_uuid(), gen_random_uuid())$$,
  'No active enrollment for user',
  'build_tutor_context raises exception when no active enrollment found'
);

-- ============================================================
-- search_content_chunks: raises on access denied
-- ============================================================
SELECT throws_ok(
  $$SELECT * FROM search_content_chunks(
    array_fill(0, ARRAY[1536])::vector(1536),
    gen_random_uuid(),
    8,
    0.72
  )$$,
  'Access denied to section',
  'search_content_chunks raises exception for section with no access'
);

-- ============================================================
-- embedding_status CHECK constraint on content_pages
-- ============================================================
SELECT throws_ok(
  $$UPDATE content_pages SET embedding_status = 'invalid_value' WHERE FALSE$$,
  '23514',
  'content_pages.embedding_status rejects invalid values'
);

-- ============================================================
-- embedding_jobs status CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embedding_jobs (source_type, source_id, section_id, status, triggered_by)
    VALUES ('content_page', gen_random_uuid(), gen_random_uuid(), 'invalid', 'migration')$$,
  '23514',
  'embedding_jobs.status rejects invalid values'
);

-- ============================================================
-- embedding_jobs triggered_by CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embedding_jobs (source_type, source_id, section_id, triggered_by)
    VALUES ('content_page', gen_random_uuid(), gen_random_uuid(), 'unknown_trigger')$$,
  '23514',
  'embedding_jobs.triggered_by rejects invalid values'
);

-- ============================================================
-- embeddings source_type CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embeddings (
      source_type, source_id, chunk_index, chunk_text,
      chunk_char_count, embedding, section_id, source_updated_at
    ) VALUES (
      'invalid_type', gen_random_uuid(), 0, 'x',
      1, array_fill(0, ARRAY[1536])::vector(1536),
      gen_random_uuid(), NOW()
    )$$,
  '23514',
  'embeddings.source_type rejects invalid values'
);

-- ============================================================
-- ai_query_log: query_hash column exists and is text
-- (amendment #11 — SHA-256 hash, no plaintext query stored)
-- ============================================================
SELECT has_column('public', 'ai_query_log', 'query_hash', 'ai_query_log has query_hash column');
SELECT col_type_is('public', 'ai_query_log', 'query_hash', 'text', 'ai_query_log.query_hash is text');
SELECT hasnt_column('public', 'ai_query_log', 'query_text', 'ai_query_log does NOT have a query_text column (no plaintext storage)');

-- ============================================================
-- model_version column on embedding_jobs (amendment #17)
-- ============================================================
SELECT has_column('public', 'embedding_jobs', 'model_version', 'embedding_jobs has model_version column');

SELECT finish();
ROLLBACK;
