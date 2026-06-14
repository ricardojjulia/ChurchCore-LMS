-- HQ governance tables: tasks, risks, decisions
-- These are project-level objects (not per-user) readable by all staff,
-- writable by admin/manager. created_by auto-fills from auth.uid().

-- ─── hq_sessions: fix missing DEFAULT so inserts without user_id still work ──
ALTER TABLE public.hq_sessions
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- ─── hq_tasks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hq_tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  status      text        NOT NULL DEFAULT 'backlog'
                          CHECK (status IN ('backlog','ready','in_progress','review','blocked','done')),
  owner       text,
  priority    text        NOT NULL DEFAULT 'P2'
                          CHECK (priority IN ('P0','P1','P2','P3')),
  source      text        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','risk','council')),
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_tasks: staff read all"
  ON public.hq_tasks FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_tasks: managers+ write"
  ON public.hq_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_tasks: managers+ update"
  ON public.hq_tasks FOR UPDATE
  TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_tasks: admins delete"
  ON public.hq_tasks FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ─── hq_risks ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hq_risks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  mitigation  text,
  severity    int         NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  probability int         NOT NULL DEFAULT 3 CHECK (probability BETWEEN 1 AND 5),
  owner       text,
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_risks: staff read all"
  ON public.hq_risks FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_risks: managers+ write"
  ON public.hq_risks FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_risks: managers+ update"
  ON public.hq_risks FOR UPDATE
  TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_risks: admins delete"
  ON public.hq_risks FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ─── hq_decisions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hq_decisions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  owner       text,
  status      text        NOT NULL DEFAULT 'Proposed'
                          CHECK (status IN ('Proposed','Accepted','Rejected','Superseded')),
  impact      text        NOT NULL DEFAULT 'Medium'
                          CHECK (impact IN ('Critical','High','Medium','Low')),
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_decisions: staff read all"
  ON public.hq_decisions FOR SELECT
  TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_decisions: managers+ write"
  ON public.hq_decisions FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_decisions: managers+ update"
  ON public.hq_decisions FOR UPDATE
  TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_decisions: admins delete"
  ON public.hq_decisions FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ─── Seed: bootstrap decisions, risks, tasks ─────────────────────────────────
-- Only inserts if tables are empty so this is idempotent on schema reruns.

INSERT INTO public.hq_decisions (title, owner, status, impact)
SELECT title, owner, status, impact FROM (VALUES
  ('Use Supabase RLS as authorization source of truth', 'Security Officer', 'Accepted', 'Critical'),
  ('Model lessons as canvas block model (flat course_blocks table)', 'The Architect', 'Accepted', 'High'),
  ('Separate Project HQ governance from LMS runtime tables', 'The Engineer', 'Accepted', 'Medium'),
  ('shadcn/ui as UI component library (ADR-0012)', 'The Architect', 'Accepted', 'Medium'),
  ('Two-layer identity split: profiles.uid vs profiles.auth_id (ADR-0004)', 'The Engineer', 'Accepted', 'Critical')
) AS v(title, owner, status, impact)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_decisions LIMIT 1);

INSERT INTO public.hq_risks (title, mitigation, severity, probability, owner)
SELECT title, mitigation, severity, probability, owner FROM (VALUES
  ('RLS policy gaps may expose student records', 'Policy tests for every student/teacher/admin path.', 5, 3, 'Security Officer'),
  ('Feature bloat could delay MVP', 'Phase-gate roadmap and MVP acceptance criteria.', 4, 4, 'Product Manager'),
  ('AI tutor may provide unsupervised incorrect guidance', 'Teacher-owned sources, retrieval citations, safe refusal patterns.', 4, 3, 'AI Tutor Designer'),
  ('Migration errors could corrupt identity split', 'Full migration test suite before each push.', 5, 2, 'The Engineer'),
  ('Missing enrollment gates could allow open course access', 'Enrollment RLS must be tested for every role.', 4, 3, 'Security Officer')
) AS v(title, mitigation, severity, probability, owner)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_risks LIMIT 1);

INSERT INTO public.hq_tasks (title, status, owner, priority, source)
SELECT title, status, owner, priority, source FROM (VALUES
  ('Write RLS tests for enrollments', 'backlog', 'The Tester', 'P0', 'manual'),
  ('Draft ADR-001: Canvas Block Model', 'in_progress', 'The Architect', 'P1', 'manual'),
  ('Build course builder UI', 'done', 'The Implementer', 'P0', 'manual'),
  ('Implement gradebook schema', 'backlog', 'The Engineer', 'P1', 'manual'),
  ('Design AI tutor memory architecture', 'backlog', 'AI Tutor Designer', 'P2', 'manual'),
  ('Create Playwright E2E test suite', 'backlog', 'The Tester', 'P1', 'manual'),
  ('Set up GitHub Actions CI pipeline', 'backlog', 'DevOps Officer', 'P1', 'manual')
) AS v(title, status, owner, priority, source)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_tasks LIMIT 1);
