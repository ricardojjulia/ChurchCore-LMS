-- Phase 1: content_pages table (Tiptap JSON storage)
-- ADR-2025-001

-- ─── 1. Helper: extract plain text from Tiptap JSON ─────────────────────────
-- Used for full-text search generated column and AI chunking.
-- Finds all nodes where type = "text" and concatenates their text values.

CREATE OR REPLACE FUNCTION public.tiptap_json_to_text(doc JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT SET search_path = public AS $$
  SELECT COALESCE(
    string_agg(leaf->>'text', ' '),
    ''
  )
  FROM jsonb_path_query(doc, '$.** ? (@.type == "text")') AS leaf
  WHERE (leaf->>'text') IS NOT NULL
    AND (leaf->>'text') <> ''
$$;

-- ─── 2. content_pages table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_pages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID        NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 500),
  body           JSONB       NOT NULL DEFAULT '{"type":"doc","content":[]}',
  body_text      TEXT        GENERATED ALWAYS AS (public.tiptap_json_to_text(body)) STORED,
  format_version TEXT        NOT NULL DEFAULT 'tiptap-v2',
  status         TEXT        NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published', 'archived')),
  created_by     UUID        NOT NULL REFERENCES public.profiles(uid) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at   TIMESTAMPTZ,
  sort_order     INTEGER     NOT NULL DEFAULT 0
);

-- Full-text search index on extracted body text
CREATE INDEX IF NOT EXISTS idx_content_pages_fts
  ON public.content_pages
  USING GIN (to_tsvector('english', COALESCE(body_text, '') || ' ' || title));

CREATE INDEX IF NOT EXISTS idx_content_pages_course_id
  ON public.content_pages(course_id);

CREATE INDEX IF NOT EXISTS idx_content_pages_status
  ON public.content_pages(course_id, status);

-- ─── 3. Auto-update updated_at ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_content_pages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER content_pages_updated_at
  BEFORE UPDATE ON public.content_pages
  FOR EACH ROW EXECUTE FUNCTION public.handle_content_pages_updated_at();

-- ─── 4. RLS ──────────────────────────────────────────────────────────────────

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

-- Admins and managers can manage all pages
CREATE POLICY "content_pages: admin/manager full access"
  ON public.content_pages FOR ALL
  USING  (current_user_role() IN ('admin', 'manager'))
  WITH CHECK (current_user_role() IN ('admin', 'manager'));

-- Teachers can manage pages they created
CREATE POLICY "content_pages: teacher manages own"
  ON public.content_pages FOR ALL
  USING  (current_user_role() = 'teacher' AND created_by = current_user_uid())
  WITH CHECK (current_user_role() = 'teacher');

-- Enrolled learners can read published pages only
CREATE POLICY "content_pages: learner reads published"
  ON public.content_pages FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.course_id = content_pages.course_id
        AND e.user_id   = current_user_uid()
        AND e.transit_status IN ('enrolled', 'in_progress', 'completed')
    )
  );

-- ─── 5. Safe view for learner-facing queries (excludes future embedding col) ─

CREATE OR REPLACE VIEW public.content_pages_public
  WITH (security_invoker = true)
AS
SELECT
  id, course_id, title,
  body, body_text,
  format_version, status,
  created_at, updated_at, published_at,
  sort_order
FROM public.content_pages;
