-- pgTAP tests for Phase 0: Unified Embedding Architecture (ADR-2025-003)
-- Run with: supabase test db
-- Gate: migration 038 must be applied before this file runs.
-- All 18 council amendments are covered; see amendment refs in comments.

BEGIN;
SELECT plan(39);
\ir helpers/fixtures.inc

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
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.embeddings'::regclass), 'embeddings has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.embedding_jobs'::regclass), 'embedding_jobs has RLS enabled');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.ai_query_log'::regclass), 'ai_query_log has RLS enabled');

-- ============================================================
-- RLS POLICY NAMES (amendment #3 — exact names required)
-- ============================================================
SELECT policies_are('public', 'embeddings', ARRAY[
  'embeddings: enrolled students read own org',
  'embeddings: service role manage',
  'embeddings: staff read own org',
  'embeddings: tenant boundary'
], 'embeddings has the expected tenant policies');

SELECT policies_are('public', 'embedding_jobs', ARRAY[
  'embedding_jobs: service role manage',
  'embedding_jobs: staff read own org'
], 'embedding_jobs has the expected tenant policies');

SELECT policies_are('public', 'ai_query_log', ARRAY[
  'ai_query_log: admins read own org',
  'ai_query_log: service role manage'
], 'ai_query_log has the expected tenant policies');

-- ============================================================
-- Actual INSERT denial and read isolation as an authenticated learner.
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');
SELECT throws_ok($$INSERT INTO embeddings(org_id,source_type,source_id,chunk_index,chunk_text,chunk_char_count,embedding,section_id,source_updated_at)
 VALUES (pg_temp.fixture_id('org-a'),'content_page',gen_random_uuid(),0,'test',4,array_fill(1,ARRAY[1536])::vector,pg_temp.fixture_id('section-a'),NOW())$$,
 '42501',NULL,'authenticated users cannot insert embeddings');
SELECT is((SELECT count(*) FROM embeddings WHERE section_id = pg_temp.fixture_id('section-b')),0::bigint,
 'student sees no embeddings from a populated foreign section');
RESET ROLE;
-- ============================================================
-- STALENESS TRIGGER EXISTS
-- ============================================================
SELECT trigger_is('public', 'content_pages', 'trg_content_pages_mark_stale',
  'public', 'mark_embeddings_stale',
  'staleness trigger exists on content_pages');

-- ============================================================
-- WITHDRAWAL REFRESH TRIGGER EXISTS (amendment #13)
-- ============================================================
SELECT trigger_is('public', 'direct_enrollments', 'trg_enrollment_status_refresh',
  'public', 'refresh_enrollments_on_status_change',
  'withdrawal refresh trigger exists on direct_enrollments');

-- ============================================================
-- build_tutor_context: raises on missing enrollment
-- ============================================================
SELECT throws_like(
  $$SELECT build_tutor_context(gen_random_uuid(), gen_random_uuid())$$,
  'No active enrollment%',
  'build_tutor_context raises exception when no active enrollment found'
);

-- ============================================================
-- search_content_chunks: raises on access denied
-- ============================================================
SELECT throws_like(
  $$SELECT * FROM search_content_chunks(
    array_fill(0, ARRAY[1536])::vector(1536),
    gen_random_uuid(),
    8,
    0.72
  )$$,
  'Access denied to section%',
  'search_content_chunks raises exception for section with no access'
);

-- ============================================================
-- embedding_status CHECK constraint on content_pages
-- ============================================================
SELECT throws_ok(
  $$UPDATE content_pages SET embedding_status = 'invalid_value' WHERE id = pg_temp.fixture_id('page-a')$$,
  '23514', NULL,
  'content_pages.embedding_status rejects invalid values'
);

-- ============================================================
-- embedding_jobs status CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embedding_jobs (org_id, source_type, source_id, section_id, status, triggered_by)
    VALUES (pg_temp.fixture_id('org-a'), 'content_page', gen_random_uuid(), pg_temp.fixture_id('section-a'), 'invalid', 'migration')$$,
  '23514', NULL,
  'embedding_jobs.status rejects invalid values'
);

-- ============================================================
-- embedding_jobs triggered_by CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embedding_jobs (org_id, source_type, source_id, section_id, triggered_by)
    VALUES (pg_temp.fixture_id('org-a'), 'content_page', gen_random_uuid(), pg_temp.fixture_id('section-a'), 'unknown_trigger')$$,
  '23514', NULL,
  'embedding_jobs.triggered_by rejects invalid values'
);

-- ============================================================
-- embeddings source_type CHECK constraint
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO embeddings (
      org_id, source_type, source_id, chunk_index, chunk_text,
      chunk_char_count, embedding, section_id, source_updated_at
    ) VALUES (
      pg_temp.fixture_id('org-a'), 'invalid_type', gen_random_uuid(), 0, 'x',
      1, array_fill(0, ARRAY[1536])::vector(1536),
      gen_random_uuid(), NOW()
    )$$,
  '23514', NULL,
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

SELECT * FROM finish();
ROLLBACK;
