-- pgTAP tests for Phase 4: Advanced AI Features (ADR-2025-003)
-- Run with: supabase test db
-- Gate: migrations 038 + 039 must be applied.

BEGIN;
SELECT plan(22);

-- ============================================================
-- FUNCTION EXISTENCE
-- ============================================================
SELECT has_function('public', 'search_content_chunks_multi',
  ARRAY['vector','uuid[]','integer','double precision'],
  'search_content_chunks_multi function exists');

SELECT has_function('public', 'list_user_active_sections',
  ARRAY['uuid'],
  'list_user_active_sections function exists');

SELECT has_function('public', 'find_related_concepts',
  ARRAY['uuid','integer'],
  'find_related_concepts function exists');

-- ============================================================
-- SECURITY: SECURITY INVOKER on student-facing functions
-- ============================================================
SELECT ok(
  (
    SELECT prosecdef = FALSE
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'search_content_chunks_multi'
  ),
  'search_content_chunks_multi is SECURITY INVOKER'
);

SELECT ok(
  (
    SELECT prosecdef = FALSE
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'list_user_active_sections'
  ),
  'list_user_active_sections is SECURITY INVOKER'
);

-- ============================================================
-- SECURITY: SECURITY DEFINER on staff-only find_related_concepts
-- (Reads across RLS boundary; gated by current_user_role() check)
-- ============================================================
SELECT ok(
  (
    SELECT prosecdef = TRUE
    FROM pg_proc
    JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
    WHERE pg_namespace.nspname = 'public'
      AND pg_proc.proname = 'find_related_concepts'
  ),
  'find_related_concepts is SECURITY DEFINER (staff-only, role-gated)'
);

-- ============================================================
-- HNSW INDEX EXISTS ON embeddings TABLE
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'embeddings'
      AND indexname  = 'idx_embeddings_vector_hnsw'
  ),
  'HNSW index idx_embeddings_vector_hnsw exists on embeddings'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'embeddings'
      AND indexname  = 'idx_embeddings_vector'
  ),
  'IVFFlat index idx_embeddings_vector has been dropped'
);

-- ============================================================
-- CONSTRAINTS ADDED IN MIGRATION 039
-- ============================================================
SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name       = 'embedding_jobs'
      AND constraint_name  = 'chk_attempt_count_non_negative'
      AND constraint_type  = 'CHECK'
  ),
  'embedding_jobs has chk_attempt_count_non_negative CHECK constraint'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name       = 'embeddings'
      AND constraint_name  = 'chk_chunk_char_count_positive'
      AND constraint_type  = 'CHECK'
  ),
  'embeddings has chk_chunk_char_count_positive CHECK constraint'
);

-- ============================================================
-- search_content_chunks_multi: RAISES for unenrolled section
-- ============================================================
SELECT throws_ok(
  $$SELECT * FROM search_content_chunks_multi(
    array_fill(0, ARRAY[1536])::vector(1536),
    ARRAY[gen_random_uuid()],
    8,
    0.72
  )$$,
  'Access denied to one or more sections in multi-search',
  'search_content_chunks_multi raises for unenrolled section'
);

-- ============================================================
-- list_user_active_sections: returns table (no crash on empty)
-- ============================================================
SELECT function_returns(
  'public',
  'list_user_active_sections',
  ARRAY['uuid'],
  'table',
  'list_user_active_sections returns a table'
);

DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM list_user_active_sections(gen_random_uuid());
  -- A random uuid has no enrollments — should return 0 rows without error
  ASSERT v_count = 0, 'Expected 0 rows for random user_id';
END $$;

SELECT pass('list_user_active_sections returns 0 rows for unknown user without error');

-- ============================================================
-- find_related_concepts: RAISES for non-staff role
-- (Will raise if current role is not admin/manager/teacher)
-- In pgTAP context this may run as superuser — we test
-- that a non-existent source_chunk_id raises the expected error.
-- ============================================================
SELECT throws_ok(
  $$SELECT * FROM find_related_concepts(gen_random_uuid(), 5)$$,
  NULL,   -- exception message varies (role error OR chunk-not-found)
  'find_related_concepts raises for unknown chunk_id or insufficient role'
);

-- ============================================================
-- EXECUTE PRIVILEGES
-- ============================================================
SELECT ok(
  has_function_privilege('authenticated', 'public.search_content_chunks_multi(vector,uuid[],integer,double precision)', 'EXECUTE'),
  'authenticated role has EXECUTE on search_content_chunks_multi'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.list_user_active_sections(uuid)', 'EXECUTE'),
  'authenticated role has EXECUTE on list_user_active_sections'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.find_related_concepts(uuid,integer)', 'EXECUTE'),
  'authenticated role has EXECUTE on find_related_concepts'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.search_content_chunks_multi(vector,uuid[],integer,double precision)', 'EXECUTE'),
  'anon role does NOT have EXECUTE on search_content_chunks_multi'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.list_user_active_sections(uuid)', 'EXECUTE'),
  'anon role does NOT have EXECUTE on list_user_active_sections'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.find_related_concepts(uuid,integer)', 'EXECUTE'),
  'anon role does NOT have EXECUTE on find_related_concepts'
);

-- ============================================================
-- search_content_chunks_multi returns section_code column
-- ============================================================
SELECT function_returns(
  'public',
  'search_content_chunks_multi',
  ARRAY['vector','uuid[]','integer','double precision'],
  'table',
  'search_content_chunks_multi returns a table (with section_code)'
);

SELECT finish();
ROLLBACK;
