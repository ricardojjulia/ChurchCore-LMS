-- ─── Public course preview: is_public_preview flag, RLS, column-level grants ──
-- COUNCIL-2026-027 — Public Course Catalog / Unauthenticated Preview Pages.
--
-- Adds an opt-in "public preview" flag to courses so an org can let an
-- unauthenticated visitor browse a course's curriculum outline (title +
-- structure only, never block content) before creating an account. Modeled
-- on the /join/[slug] org-lookup surface and its existing anon RLS policy,
-- "organizations: anon read active" (20260620200800).
--
-- LOAD-BEARING FINDING FROM SPEC REVIEW: migration 20260914154000 granted
-- `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` (plus a matching
-- ALTER DEFAULT PRIVILEGES clause). That means RLS is currently the ONLY
-- gate on every table for the anon role — a new RLS policy alone would make
-- a course's row visible to anon, but would NOT by itself stop a direct
-- PostgREST call from requesting the `content` column on `course_blocks`
-- (quiz answers, assignment prompts, discussion posts) for any row the
-- policy allows. This migration tightens BOTH row-level security AND
-- column-level grants — RLS alone is not sufficient here.
--
-- WARNING FOR FUTURE REVIEWERS: a future migration that runs
-- `GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon` (as 20260914154000
-- already did once, to fix a legitimate "fresh project missing API grants"
-- problem) would silently re-widen `courses` and `course_blocks` back to
-- full-column anon access, undoing the REVOKE/GRANT below. Flag any such
-- blanket grant in PR review — it must exclude these two tables, or be
-- followed immediately by a migration that re-applies this file's REVOKE/
-- GRANT pair.

-- ─── 1. is_public_preview flag + atomicity constraint ────────────────────────
-- Defaults to false for every course, existing and new. The CHECK constraint
-- enforces "preview requires published" atomically at the DB level regardless
-- of what the application does, closing any window where the flag and status
-- could briefly disagree under concurrent writes.

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_public_preview boolean NOT NULL DEFAULT false;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_preview_requires_published
  CHECK (is_public_preview = false OR status = 'published');

CREATE INDEX IF NOT EXISTS idx_courses_public_preview
  ON public.courses (org_id, is_public_preview, status)
  WHERE is_public_preview = true AND status = 'published';

-- ─── 2. Anon RLS: courses ─────────────────────────────────────────────────────
-- Never uses current_user_org_id() — that helper reads profile_roles and is
-- null for an unauthenticated caller, exactly like the existing organizations
-- anon policy this is modeled on.

CREATE POLICY "courses: anon public preview"
  ON public.courses FOR SELECT TO anon
  USING (
    is_public_preview = true
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.organizations o
      WHERE o.id = courses.org_id AND o.status = 'active'
    )
  );

-- ─── 3. Anon RLS: course_blocks ───────────────────────────────────────────────

-- is_published = true is required here too: the authenticated course detail
-- page (src/app/courses/[id]/page.tsx) already filters block visibility to
-- `is_published || isStaff` for every non-staff viewer (enrolled students
-- included) — an anonymous visitor has no staff exception, so this policy
-- must apply the same filter, or a draft/in-progress block inside an
-- otherwise-published, previewable course would leak its title publicly.

CREATE POLICY "course_blocks: anon public preview"
  ON public.course_blocks FOR SELECT TO anon
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM public.courses c
      JOIN public.organizations o ON o.id = c.org_id
      WHERE c.id = course_blocks.course_id
        AND c.is_public_preview = true
        AND c.status = 'published'
        AND o.status = 'active'
    )
  );

-- ─── 4. Column-level grant tightening (the load-bearing part) ────────────────
-- RLS alone is not sufficient here: 20260914154000 granted table-level SELECT
-- on every column of every table to anon. REVOKE that blanket grant on these
-- two tables and re-GRANT only the columns safe for public exposure.
-- `content`, `settings`, and `gamification` on course_blocks, and every
-- column on courses besides the six listed below, are deliberately excluded —
-- a direct PostgREST call with the anon key requesting an excluded column
-- must get a column-permission error, never a silently filtered/empty
-- response.

REVOKE SELECT ON public.course_blocks FROM anon;
GRANT SELECT (id, title, block_type_id, parent_block_id, sort_order, course_id, org_id, is_published)
  ON public.course_blocks TO anon;

REVOKE SELECT ON public.courses FROM anon;
GRANT SELECT (id, title, description, status, org_id, is_public_preview)
  ON public.courses TO anon;
