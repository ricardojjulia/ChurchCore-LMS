-- ============================================================
-- Phase 4: Advanced AI Features (ADR-2025-003)
-- 1. HNSW index replacing IVFFlat (apply when embeddings > 100k rows)
-- 2. search_content_chunks_multi — cross-section vector search
-- 3. list_user_active_sections — enumerate all enrolled sections
-- 4. find_related_concepts — staff cross-section concept linking
-- ============================================================

-- ============================================================
-- 1. HNSW INDEX
-- Replace IVFFlat when row count exceeds 100k (see ops runbook).
-- IVFFlat is retained as a fallback comment; remove when HNSW ships.
-- HNSW advantages: no lists tuning, better recall, supports concurrent writes.
-- Parameters: m=16 (connectivity), ef_construction=64 (build quality).
-- ============================================================
DROP INDEX IF EXISTS idx_embeddings_vector;

CREATE INDEX IF NOT EXISTS idx_embeddings_vector_hnsw
  ON embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ============================================================
-- 2. list_user_active_sections
-- Returns all sections where the calling user has an active
-- enrollment within an open access window. Used by the tutor
-- route to discover multi-section search scope.
-- SECURITY INVOKER: only the calling user's own enrollments.
-- ============================================================
CREATE OR REPLACE FUNCTION list_user_active_sections(p_user_id UUID)
RETURNS TABLE (
  section_id      UUID,
  section_code    TEXT,
  blueprint_title TEXT,
  term_name       TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.section_code,
    cb.title,
    at.term_name
  FROM direct_enrollments de
  JOIN course_sections    cs ON cs.id = de.section_id
  JOIN course_blueprints  cb ON cb.id = cs.blueprint_id
  JOIN academic_terms     at ON at.id = cs.term_id
  WHERE de.user_id = p_user_id
    AND de.status  = 'active'
    AND check_section_access(p_user_id, cs.id)
  ORDER BY at.start_date DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION list_user_active_sections FROM anon, public;
GRANT  EXECUTE ON FUNCTION list_user_active_sections TO authenticated;

-- ============================================================
-- 3. search_content_chunks_multi
-- Same contract as search_content_chunks but accepts an array
-- of section IDs — enables cross-enrollment retrieval.
-- Also returns section_code so the client can attribute citations.
-- SECURITY INVOKER: caller must have access to every section_id
-- in the array. One denied section rejects the entire call.
-- ============================================================
CREATE OR REPLACE FUNCTION search_content_chunks_multi(
  p_query_embedding        vector(1536),
  p_section_ids            UUID[],
  p_match_count            INTEGER DEFAULT 8,
  p_similarity_threshold   FLOAT   DEFAULT 0.72
)
RETURNS TABLE (
  chunk_id      UUID,
  source_type   TEXT,
  source_id     UUID,
  chunk_index   INTEGER,
  chunk_text    TEXT,
  similarity    FLOAT,
  section_id    UUID,
  section_code  TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller has access to every section in the list
  IF EXISTS (
    SELECT 1 FROM unnest(p_section_ids) AS s(id)
    WHERE NOT check_section_access(current_user_uid(), s.id)
  ) THEN
    RAISE EXCEPTION 'Access denied to one or more sections in multi-search';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_index,
    e.chunk_text,
    (1 - (e.embedding <=> p_query_embedding))::FLOAT AS similarity,
    e.section_id,
    cs.section_code
  FROM embeddings e
  JOIN course_sections cs ON cs.id = e.section_id
  WHERE
    e.section_id = ANY(p_section_ids)
    AND e.is_active = TRUE
    AND (1 - (e.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_content_chunks_multi FROM anon, public;
GRANT  EXECUTE ON FUNCTION search_content_chunks_multi TO authenticated;

-- ============================================================
-- 4. find_related_concepts
-- Staff-only cross-section concept linker.
-- Given a source chunk UUID, returns the most semantically
-- similar chunks across ALL sections (not just the caller's).
-- SECURITY DEFINER: reads across RLS boundary intentionally;
-- gated by current_user_role() check — staff only.
-- ============================================================
CREATE OR REPLACE FUNCTION find_related_concepts(
  p_source_chunk_id  UUID,
  p_limit            INTEGER DEFAULT 5
)
RETURNS TABLE (
  chunk_id        UUID,
  source_type     TEXT,
  source_id       UUID,
  chunk_text      TEXT,
  similarity      FLOAT,
  section_id      UUID,
  section_code    TEXT,
  blueprint_title TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_embedding vector(1536);
BEGIN
  IF current_user_role() NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'find_related_concepts requires staff role';
  END IF;

  SELECT embedding INTO v_embedding
  FROM embeddings
  WHERE id = p_source_chunk_id;

  IF v_embedding IS NULL THEN
    RAISE EXCEPTION 'Source chunk not found: %', p_source_chunk_id;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_text,
    (1 - (e.embedding <=> v_embedding))::FLOAT AS similarity,
    e.section_id,
    cs.section_code,
    cb.title
  FROM embeddings e
  JOIN course_sections    cs ON cs.id = e.section_id
  JOIN course_blueprints  cb ON cb.id = cs.blueprint_id
  WHERE
    e.id        != p_source_chunk_id
    AND e.is_active = TRUE
    AND (1 - (e.embedding <=> v_embedding)) >= 0.75
  ORDER BY e.embedding <=> v_embedding
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION find_related_concepts FROM anon, public;
GRANT  EXECUTE ON FUNCTION find_related_concepts TO authenticated;

-- ============================================================
-- CHECK CONSTRAINT: embedding_jobs attempt_count >= 0
-- (Covered by pgTAP Phase 3C test — adding constraint here
--  so the DB enforces it, not just the application.)
-- ============================================================
ALTER TABLE embedding_jobs
  ADD CONSTRAINT chk_attempt_count_non_negative
  CHECK (attempt_count >= 0);

-- ============================================================
-- CHECK CONSTRAINT: embeddings chunk_char_count > 0
-- ============================================================
ALTER TABLE embeddings
  ADD CONSTRAINT chk_chunk_char_count_positive
  CHECK (chunk_char_count > 0);
