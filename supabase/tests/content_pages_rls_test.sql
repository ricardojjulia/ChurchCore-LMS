-- pgTAP tests for content_pages RLS policies
-- Run with: supabase test db
-- ADR-2025-001 / CR-2025-001

BEGIN;

SELECT plan(12);

-- ─── Fixtures ────────────────────────────────────────────────────────────────
-- These tests assume the test runner can set session-level auth state.
-- In Supabase's pgTAP environment, use set_config to simulate auth.uid().

-- ─── 1. Table structure checks ───────────────────────────────────────────────

SELECT has_table(
  'public', 'content_pages',
  'content_pages table must exist'
);

SELECT has_column(
  'public', 'content_pages', 'body',
  'content_pages must have a body column'
);

SELECT has_column(
  'public', 'content_pages', 'body_text',
  'content_pages must have a body_text generated column'
);

SELECT has_column(
  'public', 'content_pages', 'format_version',
  'content_pages must have a format_version column'
);

SELECT has_column(
  'public', 'content_pages', 'status',
  'content_pages must have a status column'
);

-- ─── 2. View structure checks ─────────────────────────────────────────────────

SELECT has_view(
  'public', 'content_pages_public',
  'content_pages_public view must exist'
);

SELECT hasnt_column(
  'public', 'content_pages_public', 'embedding',
  'Public view must not expose embedding column'
);

-- ─── 3. tiptap_json_to_text function ─────────────────────────────────────────

SELECT is(
  public.tiptap_json_to_text(
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}'::JSONB
  ),
  'Hello world',
  'tiptap_json_to_text extracts text from paragraph'
);

SELECT is(
  public.tiptap_json_to_text(
    '{"type":"doc","content":[{"type":"heading","attrs":{"level":1},"content":[{"type":"text","text":"Title"}]},{"type":"paragraph","content":[{"type":"text","text":"Body"}]}]}'::JSONB
  ),
  'Title Body',
  'tiptap_json_to_text extracts text from heading and paragraph'
);

SELECT is(
  public.tiptap_json_to_text('{"type":"doc","content":[]}'::JSONB),
  '',
  'tiptap_json_to_text returns empty string for empty doc'
);

-- ─── 4. Status constraint ─────────────────────────────────────────────────────

SELECT throws_ok(
  $$
    INSERT INTO public.content_pages (course_id, title, body, format_version, status, created_by)
    SELECT id, 'Test', '{"type":"doc","content":[]}'::JSONB, 'tiptap-v2', 'invalid_status', uid
    FROM public.courses CROSS JOIN public.profiles
    LIMIT 1
  $$,
  23514,  -- check_violation
  NULL,
  'status column must reject values not in (draft, published, archived)'
);

-- ─── 5. RLS enabled ──────────────────────────────────────────────────────────

SELECT policies_are(
  'public',
  'content_pages',
  ARRAY[
    'content_pages: admin/manager full access',
    'content_pages: teacher manages own',
    'content_pages: learner reads published'
  ],
  'content_pages must have exactly 3 RLS policies'
);

SELECT finish();
ROLLBACK;
