-- ============================================================
-- Phase 0: Unified Embedding Architecture (ADR-2025-003)
-- BLOCKING: Must complete and pass QA before Phase 3A begins
-- on either CR-2025-001 or ADR-2025-002 tracks.
-- ============================================================

-- ============================================================
-- ENABLE EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================================================
-- REMOVE COLUMN-BASED EMBEDDING FROM content_pages
-- (Was proposed in CR-2025-001 Phase 3 pre-work — never shipped.
--  This migration is idempotent if the column does not exist.)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_pages' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE content_pages DROP COLUMN embedding;
  END IF;
END $$;

-- ============================================================
-- EMBEDDING STATUS COLUMNS ON content_pages
-- Lightweight tracking — the vector lives in the embeddings table.
-- ============================================================
ALTER TABLE content_pages
  ADD COLUMN IF NOT EXISTS embedding_status      TEXT        NOT NULL DEFAULT 'pending'
    CHECK (embedding_status IN ('pending','processing','complete','failed','stale')),
  ADD COLUMN IF NOT EXISTS embedding_updated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS embedding_chunk_count INTEGER;

-- ============================================================
-- EMBEDDING JOBS
-- Pipeline tracking. Dual-path: webhook fast path + pg_cron recovery.
-- attempt_count gates the recovery threshold (max 3 retries).
-- ============================================================
CREATE TABLE IF NOT EXISTS embedding_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT        NOT NULL CHECK (source_type IN (
                                'content_page',
                                'discussion_prompt',
                                'assignment_description',
                                'cohort_announcement',
                                'syllabus'
                              )),
  source_id       UUID        NOT NULL,
  section_id      UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                  'pending','processing','complete','failed','stale'
                                )),
  attempt_count   INTEGER     NOT NULL DEFAULT 0,
  chunk_count     INTEGER,
  model_used      TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  model_version   TEXT,
  triggered_by    TEXT        NOT NULL CHECK (triggered_by IN (
                                'publish_event','manual','re_index','migration'
                              )),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

ALTER TABLE embedding_jobs ENABLE ROW LEVEL SECURITY;

-- Only admins can read job status (diagnostic/operational)
CREATE POLICY "admin_read_embedding_jobs" ON embedding_jobs
  FOR SELECT
  USING (current_user_role() IN ('admin','manager'));

-- Only service role writes jobs — no authenticated write path
CREATE POLICY "service_role_manage_embedding_jobs" ON embedding_jobs
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- EMBEDDINGS TABLE
-- Unified store for all embeddable content types.
-- source_id is polymorphic (no DB-level FK); the Edge Function
-- validates source existence before insert. Service role is the
-- only writer. A nightly pg_cron job marks orphaned rows inactive.
-- ============================================================
CREATE TABLE IF NOT EXISTS embeddings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification (polymorphic)
  source_type       TEXT        NOT NULL CHECK (source_type IN (
                                  'content_page',
                                  'discussion_prompt',
                                  'assignment_description',
                                  'cohort_announcement',
                                  'syllabus'
                                )),
  source_id         UUID        NOT NULL,

  -- Chunking
  chunk_index       INTEGER     NOT NULL DEFAULT 0,
  chunk_text        TEXT        NOT NULL,
  chunk_char_count  INTEGER     NOT NULL,

  -- The vector (1536 dims = text-embedding-3-small)
  embedding         vector(1536) NOT NULL,

  -- Scoping metadata — used for RLS and context assembly
  section_id        UUID        NOT NULL REFERENCES course_sections(id)  ON DELETE CASCADE,
  blueprint_id      UUID                 REFERENCES course_blueprints(id) ON DELETE SET NULL,
  term_id           UUID                 REFERENCES academic_terms(id)    ON DELETE SET NULL,

  -- Visibility (stale = pending re-embed; inactive = orphaned)
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Staleness tracking
  embedded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at TIMESTAMPTZ NOT NULL,

  UNIQUE (source_type, source_id, chunk_index)
);

-- Index: section-scoped lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_section
  ON embeddings(section_id);

-- Index: source lookups (for staleness checks and re-embed)
CREATE INDEX IF NOT EXISTS idx_embeddings_source
  ON embeddings(source_type, source_id);

-- Index: active-only scoped to section (most common access pattern)
CREATE INDEX IF NOT EXISTS idx_embeddings_active_section
  ON embeddings(section_id, is_active)
  WHERE is_active = TRUE;

-- Vector index: IVFFlat cosine (rebuild when lists < sqrt(row_count))
-- Ops runbook: monitor row count; rebuild with higher lists at 10k, 100k rows.
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
  ON embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ============================================================
-- SECTION ACCESS HELPER (2-arg: user_id + section_id)
-- SECURITY DEFINER so it can read effective_enrollments without
-- the calling user needing direct SELECT on the materialized view.
-- Returns TRUE when the user has an active enrollment with an
-- open access window for the given section.
-- ============================================================
CREATE OR REPLACE FUNCTION check_section_access(p_user_id UUID, p_section_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM effective_enrollments
    WHERE user_id           = p_user_id
      AND section_id        = p_section_id
      AND has_active_access = TRUE
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION check_section_access(UUID, UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION check_section_access(UUID, UUID) TO authenticated;

ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

-- Students can only read embeddings for sections they are actively
-- enrolled in with an open access window.
CREATE POLICY "enrolled_student_read_embeddings" ON embeddings
  FOR SELECT TO authenticated
  USING (
    is_active = TRUE
    AND check_section_access(current_user_uid(), section_id)
  );

-- No authenticated role inserts/updates/deletes embeddings.
-- Only service role (Edge Functions) writes this table.
CREATE POLICY "service_role_manage_embeddings" ON embeddings
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- AI QUERY LOG
-- Operational observability — no PII, no plaintext queries.
-- SHA-256 of query text allows correlation without storage.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_query_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  section_id       UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  context_version  TEXT        NOT NULL DEFAULT 'v1',
  query_hash       TEXT        NOT NULL, -- SHA-256 of query text, hex-encoded
  chunk_count      INTEGER,              -- Number of chunks returned by search
  similarity_max   FLOAT,               -- Highest similarity score in results
  similarity_min   FLOAT,               -- Lowest similarity score in results
  model_used       TEXT        NOT NULL DEFAULT 'text-embedding-3-small',
  responded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ai_query_log ENABLE ROW LEVEL SECURITY;

-- Admins can audit query logs (no student-identifiable content stored)
CREATE POLICY "admin_read_ai_query_log" ON ai_query_log
  FOR SELECT
  USING (current_user_role() IN ('admin','manager'));

-- Students cannot read query log (even their own — this is admin-only)
-- Service role writes log entries from the API route
CREATE POLICY "service_role_manage_ai_query_log" ON ai_query_log
  FOR ALL TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- ============================================================
-- SEMANTIC SEARCH FUNCTION
-- SECURITY INVOKER: runs as the calling user — RLS applies.
-- Explicit check_section_access() is a second line of defense.
-- Never persists query embeddings — use-and-discard in-flight.
-- ============================================================
CREATE OR REPLACE FUNCTION search_content_chunks(
  p_query_embedding        vector(1536),
  p_section_id             UUID,
  p_match_count            INTEGER DEFAULT 8,
  p_similarity_threshold   FLOAT   DEFAULT 0.72
)
RETURNS TABLE (
  chunk_id     UUID,
  source_type  TEXT,
  source_id    UUID,
  chunk_index  INTEGER,
  chunk_text   TEXT,
  similarity   FLOAT,
  section_id   UUID
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT check_section_access(current_user_uid(), p_section_id) THEN
    RAISE EXCEPTION 'Access denied to section %', p_section_id;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_index,
    e.chunk_text,
    (1 - (e.embedding <=> p_query_embedding))::FLOAT AS similarity,
    e.section_id
  FROM embeddings e
  WHERE
    e.section_id = p_section_id
    AND e.is_active = TRUE
    AND (1 - (e.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION search_content_chunks FROM anon, public;
GRANT  EXECUTE ON FUNCTION search_content_chunks TO authenticated;

-- ============================================================
-- TUTOR CONTEXT BUILDER
-- SECURITY INVOKER: only returns context for the calling user's
-- own active enrollment. Raises exception if none found.
-- Returns JSONB — consumed server-side only, never sent to client.
-- ============================================================
CREATE OR REPLACE FUNCTION build_tutor_context(
  p_user_id    UUID,
  p_section_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_context JSONB;
BEGIN
  SELECT jsonb_build_object(
    'userId',             p_user_id,
    'sectionId',          cs.id,
    'sectionCode',        cs.section_code,
    'blueprintTitle',     cb.title,
    'termName',           at.term_name,
    'deliveryFormat',     cs.delivery_format,
    'cohortName',         gc.cohort_name,
    'cohortCode',         gc.cohort_code,
    'programTrackName',   pt.name,
    'programTrackCode',   pt.code,
    'enrollmentStatus',   de.status,
    'accessWindowOpen',   check_section_access(p_user_id, p_section_id),
    'accessWindowEnd',    aw.end_date,
    'contextVersion',     'v1'
  )
  INTO v_context
  FROM direct_enrollments de
  JOIN course_sections    cs ON cs.id = de.section_id
  JOIN course_blueprints  cb ON cb.id = cs.blueprint_id
  JOIN academic_terms     at ON at.id = cs.term_id
  JOIN access_windows     aw ON aw.section_id = cs.id
  LEFT JOIN cohort_members   cm ON cm.user_id = de.user_id AND cm.status = 'active'
  LEFT JOIN global_cohorts   gc ON gc.id = cm.cohort_id
  LEFT JOIN program_tracks   pt ON pt.id = gc.program_track_id
  WHERE de.user_id    = p_user_id
    AND de.section_id = p_section_id
    AND de.status     = 'active'
  LIMIT 1;

  IF v_context IS NULL THEN
    RAISE EXCEPTION 'No active enrollment for user % in section %',
      p_user_id, p_section_id;
  END IF;

  RETURN v_context;
END;
$$;

REVOKE EXECUTE ON FUNCTION build_tutor_context FROM anon, public;
GRANT  EXECUTE ON FUNCTION build_tutor_context TO authenticated;

-- ============================================================
-- STALENESS TRIGGER ON content_pages
-- When a published page is updated, mark its existing embeddings
-- stale and set embedding_status = 'stale' so the Edge Function
-- recovery path picks it up for re-embedding.
-- ============================================================
CREATE OR REPLACE FUNCTION mark_embeddings_stale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when body content actually changed
  IF OLD.body IS DISTINCT FROM NEW.body AND NEW.status = 'published' THEN
    UPDATE embeddings
    SET is_active = FALSE
    WHERE source_type = 'content_page'
      AND source_id   = NEW.id;

    NEW.embedding_status     := 'stale';
    NEW.embedding_updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_content_pages_mark_stale
  BEFORE UPDATE ON content_pages
  FOR EACH ROW
  EXECUTE FUNCTION mark_embeddings_stale();

-- ============================================================
-- IMMEDIATE REFRESH ON ENROLLMENT WITHDRAWAL
-- Security requirement (Council DP4): a withdrawn student must
-- lose access within 1 minute, not on the next pg_cron cycle.
-- Uses CONCURRENTLY to avoid blocking concurrent readers.
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_enrollments_on_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status IN ('withdrawn', 'suspended')
  THEN
    REFRESH MATERIALIZED VIEW CONCURRENTLY effective_enrollments;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enrollment_status_refresh
  AFTER UPDATE OF status ON direct_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION refresh_enrollments_on_status_change();

-- ============================================================
-- NIGHTLY ORPHAN CLEANUP (pg_cron)
-- Marks embeddings inactive where the source content_page no
-- longer exists. Runs nightly at 03:00 UTC.
-- ============================================================
SELECT cron.schedule(
  'embeddings-orphan-cleanup',
  '0 3 * * *',
  $$
    UPDATE embeddings e
    SET is_active = FALSE
    WHERE e.source_type = 'content_page'
      AND e.is_active   = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM content_pages cp WHERE cp.id = e.source_id
      );
  $$
);

-- ============================================================
-- RECOVERY JOB REQUEUE (pg_cron)
-- Picks up jobs stuck in 'pending' for >5 min or 'failed' with
-- <3 attempts. Resets to 'pending' for the Edge Function to retry.
-- Runs every 10 minutes.
-- ============================================================
SELECT cron.schedule(
  'embedding-jobs-recovery',
  '*/10 * * * *',
  $$
    UPDATE embedding_jobs
    SET
      status        = 'pending',
      attempt_count = attempt_count + 1,
      error_message = NULL
    WHERE (
      (status = 'pending'    AND created_at  < NOW() - INTERVAL '5 minutes')
      OR
      (status = 'failed'     AND attempt_count < 3)
    );
  $$
);

-- ============================================================
-- QUEUE PUBLISHED PAGES FOR INITIAL EMBEDDING
-- Seeds embedding_jobs for all currently published pages so
-- the Edge Function pipeline can process them after deploy.
-- ============================================================
INSERT INTO embedding_jobs (source_type, source_id, section_id, triggered_by)
SELECT
  'content_page',
  cp.id,
  cs.id,
  'migration'
FROM content_pages cp
JOIN course_blueprints cb ON cb.id = cp.course_id
JOIN course_sections   cs ON cs.blueprint_id = cb.id
WHERE cp.status = 'published'
  AND NOT EXISTS (
    SELECT 1 FROM embedding_jobs ej
    WHERE ej.source_type = 'content_page'
      AND ej.source_id   = cp.id
  );
