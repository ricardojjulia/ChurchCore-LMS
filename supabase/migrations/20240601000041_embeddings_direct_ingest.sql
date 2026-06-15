-- ============================================================
-- Migration 041: Allow direct embedding ingest without section context
--
-- Migration 038 required section_id NOT NULL on embeddings, which
-- blocked embedding generation for course-based content pages that
-- haven't been assigned to an academic section yet. This migration:
--   1. Makes section_id nullable so pages can be embedded at publish time.
--   2. Updates RLS: null-section rows are staff-only (not student-accessible).
--   3. Adds a staff-read policy so teachers can use find_related_concepts.
--   4. Fixes find_related_concepts to LEFT JOIN (safe with nullable section).
--   5. Mirrors section_id nullable on embedding_jobs for consistency.
-- ============================================================

-- ── 1. Make section_id nullable ───────────────────────────────────────

ALTER TABLE embeddings
  ALTER COLUMN section_id DROP NOT NULL;

ALTER TABLE embedding_jobs
  ALTER COLUMN section_id DROP NOT NULL;

-- ── 2. Rebuild student read policy (null section = not accessible) ─────

DROP POLICY IF EXISTS "enrolled_student_read_embeddings" ON embeddings;
CREATE POLICY "enrolled_student_read_embeddings" ON embeddings
  FOR SELECT TO authenticated
  USING (
    is_active  = TRUE
    AND section_id IS NOT NULL
    AND check_section_access(current_user_uid(), section_id)
  );

-- ── 3. Staff read policy (teachers see all active embeddings) ──────────
-- Required for find_related_concepts and RelatedConceptsPanel.

DROP POLICY IF EXISTS "staff_read_embeddings" ON embeddings;
CREATE POLICY "staff_read_embeddings" ON embeddings
  FOR SELECT TO authenticated
  USING (
    is_active = TRUE
    AND current_user_role() IN ('admin', 'manager', 'teacher')
  );

-- ── 4. Fix find_related_concepts to handle nullable section_id ─────────
-- Switch JOIN → LEFT JOIN so rows without a section are still returned.
-- Also exposes source_id and blueprint_title (or NULL) in the output.

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
  LEFT JOIN course_sections   cs ON cs.id = e.section_id
  LEFT JOIN course_blueprints cb ON cb.id = cs.blueprint_id
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
