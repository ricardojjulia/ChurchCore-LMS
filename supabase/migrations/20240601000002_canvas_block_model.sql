-- =============================================================================
-- ChurchCore LMS — Migration 002: Canvas Block Model
-- Replaces modules+JSONB with course_blocks, upgrades enrollments to a full
-- state-machine, adds organizations, block_types registry, block_submissions.
-- Run in Supabase SQL Editor.
-- =============================================================================

-- ─── 1. ORGANIZATIONS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text  NOT NULL,
  slug       text  UNIQUE NOT NULL,
  settings   jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  user_id    uuid REFERENCES auth.users(id)            ON DELETE CASCADE NOT NULL,
  role       text NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- ─── 2. COURSES: add status column, drop is_published ────────────────────────

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived', 'suspended'));

-- Migrate boolean → status enum
UPDATE public.courses SET status = 'published' WHERE is_published = true;

-- Remove the old column (code now uses status)
ALTER TABLE public.courses DROP COLUMN IF EXISTS is_published;

-- ─── 3. BLOCK TYPES REGISTRY ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.block_types (
  id             text PRIMARY KEY,
  label          text NOT NULL,
  icon           text NOT NULL,
  category       text NOT NULL CHECK (category IN ('content', 'activity', 'structure')),
  schema_version int  NOT NULL DEFAULT 1,
  is_active      bool NOT NULL DEFAULT true
);

INSERT INTO public.block_types (id, label, icon, category, is_active) VALUES
  ('module_header', 'Module',        '📁', 'structure', true),
  ('section',       'Section',       '📂', 'structure', false),
  ('certificate',   'Certificate',   '🏆', 'structure', false),
  ('page',          'Page',          '📄', 'content',   true),
  ('video_stream',  'Video',         '🎬', 'content',   true),
  ('resource_file', 'File',          '📎', 'content',   true),
  ('external_url',  'External URL',  '🔗', 'content',   true),
  ('scorm',         'SCORM Package', '📦', 'content',   false),
  ('live_session',  'Live Session',  '🎙️','content',   false),
  ('assignment',    'Assignment',    '📝', 'activity',  true),
  ('quiz',          'Quiz',          '🧠', 'activity',  true),
  ('discussion',    'Discussion',    '💬', 'activity',  true),
  ('survey',        'Survey',        '📊', 'activity',  false),
  ('checklist',     'Checklist',     '✅', 'activity',  false),
  ('flashcard_set', 'Flashcard Set', '🗂️','activity',  false)
ON CONFLICT (id) DO NOTHING;

-- ─── 4. COURSE BLOCKS (replaces modules table + JSONB items) ─────────────────

CREATE TABLE IF NOT EXISTS public.course_blocks (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       uuid  REFERENCES public.courses(id)        ON DELETE CASCADE NOT NULL,
  parent_block_id uuid  REFERENCES public.course_blocks(id)  ON DELETE CASCADE,
  block_type_id   text  REFERENCES public.block_types(id)    NOT NULL,
  title           text  NOT NULL DEFAULT '',
  sort_order      float NOT NULL DEFAULT 0,
  content         jsonb NOT NULL DEFAULT '{}',
  settings        jsonb NOT NULL DEFAULT '{}',
  gamification    jsonb NOT NULL DEFAULT '{}',
  is_published    bool  NOT NULL DEFAULT true,
  created_by      uuid  REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_blocks_course_id
  ON public.course_blocks(course_id);
CREATE INDEX IF NOT EXISTS idx_course_blocks_parent
  ON public.course_blocks(parent_block_id);
CREATE INDEX IF NOT EXISTS idx_course_blocks_sort
  ON public.course_blocks(course_id, sort_order);

-- ─── 5. MIGRATE modules → course_blocks ──────────────────────────────────────

DO $$
DECLARE
  mod       RECORD;
  header_id uuid;
  item      jsonb;
  item_sort float := 0;
BEGIN
  FOR mod IN
    SELECT id, course_id, title, position, items
    FROM   public.modules
    ORDER  BY course_id, position
  LOOP
    INSERT INTO public.course_blocks
      (course_id, block_type_id, title, sort_order)
    VALUES
      (mod.course_id, 'module_header', mod.title, (mod.position * 1000)::float)
    RETURNING id INTO header_id;

    IF mod.items IS NOT NULL AND jsonb_array_length(mod.items) > 0 THEN
      FOR item IN
        SELECT value
        FROM   jsonb_array_elements(mod.items)
        ORDER  BY (value->>'position')::int
      LOOP
        INSERT INTO public.course_blocks
          (course_id, parent_block_id, block_type_id, title, sort_order, content, gamification)
        VALUES (
          mod.course_id,
          header_id,
          item->>'type',
          COALESCE(item->>'title', ''),
          item_sort,
          item - 'id' - 'position' - 'type' - 'title' - 'gamification',
          COALESCE(item->'gamification', '{}')
        );
        item_sort := item_sort + 1000;
      END LOOP;
    END IF;

    item_sort := 0;
  END LOOP;
END $$;

-- ─── 6. ENROLLMENT ENUMS + course_enrollments ────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.enrollment_role AS ENUM
    ('student','observer','ta','designer','grader','facilitator','auditor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM
    ('pending','active','completed','withdrawn','suspended','waitlisted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enrollment_source AS ENUM
    ('self','admin','invitation','import','api');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        uuid REFERENCES public.courses(id)  ON DELETE CASCADE NOT NULL,
  user_id          uuid REFERENCES auth.users(id)       ON DELETE CASCADE NOT NULL,
  role             public.enrollment_role   NOT NULL DEFAULT 'student',
  status           public.enrollment_status NOT NULL DEFAULT 'pending',
  source           public.enrollment_source NOT NULL DEFAULT 'self',
  enrolled_at      timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  last_activity_at timestamptz,
  metadata         jsonb NOT NULL DEFAULT '{}',
  UNIQUE(course_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_user
  ON public.course_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course
  ON public.course_enrollments(course_id);

-- Migrate existing enrollments
INSERT INTO public.course_enrollments
  (course_id, user_id, role, status, source, enrolled_at)
SELECT
  e.course_id, e.user_id, 'student', 'active', 'admin', e.enrolled_at
FROM public.enrollments e
ON CONFLICT (course_id, user_id, role) DO NOTHING;

-- ─── 7. BLOCK SUBMISSIONS (replaces submissions table) ───────────────────────

CREATE TABLE IF NOT EXISTS public.block_submissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id       uuid REFERENCES public.course_blocks(id)      ON DELETE CASCADE NOT NULL,
  enrollment_id  uuid REFERENCES public.course_enrollments(id) ON DELETE CASCADE NOT NULL,
  user_id        uuid REFERENCES auth.users(id)                 ON DELETE CASCADE NOT NULL,
  attempt_number int  NOT NULL DEFAULT 1,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','submitted','graded','returned','excused')),
  content        jsonb NOT NULL DEFAULT '{}',
  score          numeric,
  max_score      numeric,
  feedback       text,
  graded_by      uuid REFERENCES auth.users(id),
  graded_at      timestamptz,
  submitted_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. UPDATED_AT TRIGGERS ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS course_blocks_updated_at    ON public.course_blocks;
DROP TRIGGER IF EXISTS block_submissions_updated_at ON public.block_submissions;

CREATE TRIGGER course_blocks_updated_at
  BEFORE UPDATE ON public.course_blocks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER block_submissions_updated_at
  BEFORE UPDATE ON public.block_submissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── 9. ROW-LEVEL SECURITY ────────────────────────────────────────────────────

ALTER TABLE public.organizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.block_submissions  ENABLE ROW LEVEL SECURITY;

-- ── Organizations ──
CREATE POLICY "org members can view their org"
ON public.organizations FOR SELECT
USING (id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

CREATE POLICY "admins can manage orgs"
ON public.organizations FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── Org members ──
CREATE POLICY "members can view co-members"
ON public.org_members FOR SELECT
USING (org_id IN (SELECT org_id FROM public.org_members WHERE user_id = auth.uid()));

-- ── Course blocks: staff see all ──
CREATE POLICY "staff can view all blocks"
ON public.course_blocks FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin'))
);

-- ── Course blocks: enrolled students see published blocks ──
CREATE POLICY "enrolled students can view published blocks"
ON public.course_blocks FOR SELECT
USING (
  is_published AND course_id IN (
    SELECT course_id FROM public.course_enrollments
    WHERE  user_id = auth.uid() AND status = 'active'
  )
);

-- ── Course blocks: owners can manage their content ──
CREATE POLICY "course owners can manage their blocks"
ON public.course_blocks FOR ALL
USING (
  course_id IN (SELECT id FROM public.courses WHERE owner_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin'))
)
WITH CHECK (
  course_id IN (SELECT id FROM public.courses WHERE owner_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin'))
);

-- ── Course enrollments ──
CREATE POLICY "students view own enrollments"
ON public.course_enrollments FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "staff view all enrollments"
ON public.course_enrollments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin')));

CREATE POLICY "students can self-enroll"
ON public.course_enrollments FOR INSERT
WITH CHECK (user_id = auth.uid() AND source = 'self' AND role = 'student');

CREATE POLICY "staff manage all enrollments"
ON public.course_enrollments FOR ALL
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin')));

-- ── Block submissions ──
CREATE POLICY "students manage their submissions"
ON public.block_submissions FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "staff view all submissions"
ON public.block_submissions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin')));

-- ─── 10. UPDATE COURSES RLS FOR NEW status COLUMN ────────────────────────────

-- Drop old policy that referenced is_published (now removed)
DROP POLICY IF EXISTS "Courses visible only if user meets level and prerequisite requirements"
  ON public.courses;

-- Staff see all courses; students see published courses they qualify for
CREATE POLICY "courses visible to qualified users"
ON public.courses FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher','admin'))
  OR (
    courses.status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE  id = auth.uid() AND current_level >= courses.min_required_level
    )
    AND (
      courses.prerequisite_course_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.course_enrollments
        WHERE  user_id = auth.uid()
        AND    course_id = courses.prerequisite_course_id
        AND    status = 'completed'
      )
    )
  )
);
