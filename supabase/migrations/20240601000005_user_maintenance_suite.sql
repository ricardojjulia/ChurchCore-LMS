-- =============================================================================
-- ChurchCore LMS — ADR-0004: User Identity Architecture & Role System
-- Phase 0: Foundation — Identity Spine, RACI, Audit Trail
--
-- Separates auth identity (auth.uid()) from domain identity (profiles.uid),
-- adds manager role, codifies RACI in role_permissions, creates audit log,
-- rebuilds all affected RLS policies.
--
-- Run order: after 20240601000004_hq_sessions.sql
-- =============================================================================

-- ─── PART 1: ENUMS ───────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'teacher', 'student');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE public.user_status AS ENUM ('active', 'suspended', 'pending', 'archived');
  END IF;
END $$;

-- ─── PART 2: DROP ALL POLICIES THAT DEPEND ON profiles.role OR profiles.id ───
-- PostgreSQL prevents altering/dropping columns while policies depend on them.
-- Drop everything here; rebuild at the end once the schema is stable.

-- profiles
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users"                    ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile"                              ON public.profiles;
DROP POLICY IF EXISTS "profiles: self read"                                             ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin manager read all"                                ON public.profiles;
DROP POLICY IF EXISTS "profiles: teacher read enrolled students"                        ON public.profiles;
DROP POLICY IF EXISTS "profiles: self update non-privileged fields"                     ON public.profiles;
DROP POLICY IF EXISTS "profiles: self update display name avatar"                       ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin full update"                                     ON public.profiles;
DROP POLICY IF EXISTS "profiles: admin insert"                                          ON public.profiles;
DROP POLICY IF EXISTS "profiles: no delete"                                             ON public.profiles;

-- profile_badges
DROP POLICY IF EXISTS "Only admins can award badges"                                    ON public.profile_badges;
DROP POLICY IF EXISTS "Users can view all earned badge records"                         ON public.profile_badges;
DROP POLICY IF EXISTS "profile_badges: authenticated read"                              ON public.profile_badges;
DROP POLICY IF EXISTS "profile_badges: admin insert"                                    ON public.profile_badges;

-- courses
DROP POLICY IF EXISTS "Courses visible only if user meets level and prerequisite requirements" ON public.courses;
DROP POLICY IF EXISTS "Teachers and admins can create courses"                          ON public.courses;
DROP POLICY IF EXISTS "Course owners can update their courses"                          ON public.courses;
DROP POLICY IF EXISTS "Course owners and admins can delete courses"                     ON public.courses;
DROP POLICY IF EXISTS "courses visible to qualified users"                              ON public.courses;
DROP POLICY IF EXISTS "Teachers and admins can insert courses"                          ON public.courses;
DROP POLICY IF EXISTS "courses: published courses visible to level-qualified users"     ON public.courses;
DROP POLICY IF EXISTS "courses: teachers and admins can insert"                         ON public.courses;
DROP POLICY IF EXISTS "courses: owners and admins can update"                           ON public.courses;
DROP POLICY IF EXISTS "courses: owners and admins can delete"                           ON public.courses;

-- enrollments (legacy)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='enrollments') THEN
    DROP POLICY IF EXISTS "Students can view their own enrollments"                     ON public.enrollments;
    DROP POLICY IF EXISTS "Teachers and admins can view all enrollments"                ON public.enrollments;
    DROP POLICY IF EXISTS "Students can self-enroll in published courses"               ON public.enrollments;
    DROP POLICY IF EXISTS "enrollments: self read"                                      ON public.enrollments;
    DROP POLICY IF EXISTS "enrollments: teacher admin read"                             ON public.enrollments;
    DROP POLICY IF EXISTS "enrollments: self enroll"                                    ON public.enrollments;
  END IF;
END $$;

-- modules (legacy)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='modules') THEN
    DROP POLICY IF EXISTS "Enrolled students can view modules"                          ON public.modules;
    DROP POLICY IF EXISTS "Teachers and admins can manage modules"                      ON public.modules;
    DROP POLICY IF EXISTS "modules: enrolled students read"                             ON public.modules;
    DROP POLICY IF EXISTS "modules: teacher admin manage"                               ON public.modules;
  END IF;
END $$;

-- submissions (legacy)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') THEN
    DROP POLICY IF EXISTS "Students can view and create their own submissions"          ON public.submissions;
    DROP POLICY IF EXISTS "Teachers and admins can view and grade all submissions"      ON public.submissions;
    DROP POLICY IF EXISTS "submissions: self manage"                                    ON public.submissions;
    DROP POLICY IF EXISTS "submissions: teacher admin manage"                           ON public.submissions;
  END IF;
END $$;

-- organizations
DROP POLICY IF EXISTS "admins can manage orgs"                                          ON public.organizations;
DROP POLICY IF EXISTS "members can view their org"                                      ON public.organizations;

-- course_blocks
DROP POLICY IF EXISTS "staff can view all blocks"                                       ON public.course_blocks;
DROP POLICY IF EXISTS "course owners can manage their blocks"                           ON public.course_blocks;
DROP POLICY IF EXISTS "enrolled students can view course blocks"                        ON public.course_blocks;

-- course_enrollments
DROP POLICY IF EXISTS "staff view all enrollments"                                      ON public.course_enrollments;
DROP POLICY IF EXISTS "staff manage all enrollments"                                    ON public.course_enrollments;
DROP POLICY IF EXISTS "Enrolled users can view their enrollments"                       ON public.course_enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments for their courses"                 ON public.course_enrollments;
DROP POLICY IF EXISTS "Users can enroll themselves"                                     ON public.course_enrollments;
DROP POLICY IF EXISTS "Admins manage all enrollments"                                   ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: self read"                                   ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: teacher admin read"                          ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: self enroll"                                 ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: admin manage"                                ON public.course_enrollments;

-- block_submissions
DROP POLICY IF EXISTS "staff view all submissions"                                      ON public.block_submissions;
DROP POLICY IF EXISTS "students view own submissions"                                   ON public.block_submissions;
DROP POLICY IF EXISTS "students submit"                                                 ON public.block_submissions;

-- hq_sessions
DROP POLICY IF EXISTS "admins can view all hq sessions"                                 ON public.hq_sessions;
DROP POLICY IF EXISTS "users manage their own hq sessions"                              ON public.hq_sessions;

-- ─── PART 3: ALTER PROFILES — ADD NEW COLUMNS ────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS uid          UUID             DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS auth_id      UUID,
  ADD COLUMN IF NOT EXISTS student_id   TEXT,
  ADD COLUMN IF NOT EXISTS email        TEXT,
  ADD COLUMN IF NOT EXISTS status       public.user_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS org_id       UUID             REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Populate auth_id and email from existing data
UPDATE public.profiles p
SET
  auth_id = p.id,
  email   = au.email
FROM auth.users au
WHERE au.id = p.id;

ALTER TABLE public.profiles
  ALTER COLUMN auth_id SET NOT NULL,
  ALTER COLUMN email   SET NOT NULL;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_auth_id_unique UNIQUE (auth_id);

-- Rename full_name → display_name
ALTER TABLE public.profiles RENAME COLUMN full_name TO display_name;

-- ─── PART 4: MIGRATE role COLUMN TEXT → user_role ENUM ──────────────────────
-- Now safe: all dependent policies were dropped in Part 2.

ALTER TABLE public.profiles ADD COLUMN role_new public.user_role;
UPDATE public.profiles SET role_new = role::public.user_role;
ALTER TABLE public.profiles ALTER COLUMN role_new SET NOT NULL;
ALTER TABLE public.profiles ALTER COLUMN role_new SET DEFAULT 'student';
ALTER TABLE public.profiles DROP COLUMN role;
ALTER TABLE public.profiles RENAME COLUMN role_new TO role;

-- ─── PART 5: DROP ALL CHILD FKs REFERENCING profiles(id) ────────────────────
-- Required before we can drop the old PK.

ALTER TABLE public.profile_badges     DROP CONSTRAINT IF EXISTS profile_badges_profile_id_fkey;
ALTER TABLE public.courses            DROP CONSTRAINT IF EXISTS courses_owner_id_fkey;
ALTER TABLE public.course_enrollments DROP CONSTRAINT IF EXISTS course_enrollments_user_id_fkey;
ALTER TABLE public.block_submissions  DROP CONSTRAINT IF EXISTS block_submissions_user_id_fkey;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='enrollments') THEN
    ALTER TABLE public.enrollments DROP CONSTRAINT IF EXISTS enrollments_user_id_fkey;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') THEN
    ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_student_id_fkey;
  END IF;
END $$;

-- ─── PART 6: SWAP PK — profiles.id → profiles.uid ────────────────────────────

ALTER TABLE public.profiles ALTER COLUMN uid SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT profiles_pkey;
ALTER TABLE public.profiles ADD PRIMARY KEY (uid);

-- Replace the old id→auth.users FK with auth_id→auth.users FK
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_auth_id_fkey
  FOREIGN KEY (auth_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ─── PART 7: UPDATE CHILD TABLE FK VALUES AND RESTORE FKs ───────────────────
-- Map: old value (= auth.uid()) is now stored in profiles.auth_id
-- New FK value is profiles.uid (new random UUID)

-- profile_badges
UPDATE public.profile_badges pb
SET profile_id = p.uid
FROM public.profiles p
WHERE p.auth_id = pb.profile_id;

ALTER TABLE public.profile_badges
  ADD CONSTRAINT profile_badges_profile_id_fkey
  FOREIGN KEY (profile_id) REFERENCES public.profiles(uid) ON DELETE CASCADE;

-- courses
UPDATE public.courses c
SET owner_id = p.uid
FROM public.profiles p
WHERE p.auth_id = c.owner_id;

ALTER TABLE public.courses
  ADD CONSTRAINT courses_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(uid);

-- course_enrollments (column is user_id, not uid)
UPDATE public.course_enrollments ce
SET user_id = p.uid
FROM public.profiles p
WHERE p.auth_id = ce.user_id;

ALTER TABLE public.course_enrollments
  ADD CONSTRAINT course_enrollments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(uid) ON DELETE CASCADE;

-- block_submissions
UPDATE public.block_submissions bs
SET user_id = p.uid
FROM public.profiles p
WHERE p.auth_id = bs.user_id;

ALTER TABLE public.block_submissions
  ADD CONSTRAINT block_submissions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(uid) ON DELETE CASCADE;

-- enrollments (legacy — conditional)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='enrollments') THEN
    UPDATE public.enrollments e SET user_id = p.uid FROM public.profiles p WHERE p.auth_id = e.user_id;
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(uid) ON DELETE CASCADE;
  END IF;
END $$;

-- submissions (legacy — conditional)
DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') THEN
    UPDATE public.submissions s SET student_id = p.uid FROM public.profiles p WHERE p.auth_id = s.student_id;
    ALTER TABLE public.submissions ADD CONSTRAINT submissions_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.profiles(uid) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── PART 8: DROP OLD id COLUMN ──────────────────────────────────────────────

ALTER TABLE public.profiles DROP COLUMN id;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_format
  CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$');

CREATE INDEX IF NOT EXISTS idx_profiles_auth_id   ON public.profiles(auth_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role       ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status     ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_student_id ON public.profiles(student_id) WHERE student_id IS NOT NULL;

-- ─── PART 9: STUDENT ID GENERATION ──────────────────────────────────────────

CREATE SEQUENCE IF NOT EXISTS public.student_id_seq START 1000;

CREATE OR REPLACE FUNCTION public.generate_student_id()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'CC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('public.student_id_seq')::TEXT, 6, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_student_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.role = 'student' AND NEW.student_id IS NULL THEN
    NEW.student_id := public.generate_student_id();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_student_id ON public.profiles;
CREATE TRIGGER trg_assign_student_id
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_student_id();

-- Back-fill student_id for existing student profiles
UPDATE public.profiles SET student_id = public.generate_student_id()
WHERE role = 'student' AND student_id IS NULL;

-- ─── PART 10: UPDATE handle_new_user TRIGGER ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (auth_id, display_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'student',
    'active'
  );
  RETURN NEW;
END;
$$;

-- ─── PART 11: HELPER FUNCTIONS ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_user_uid()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT uid FROM public.profiles WHERE auth_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles
  WHERE auth_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

-- ─── PART 12: ROLE PERMISSIONS TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role       public.user_role NOT NULL,
  resource   TEXT NOT NULL,
  action     TEXT NOT NULL,
  raci_type  TEXT NOT NULL CHECK (raci_type IN ('R','A','C','I')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, resource, action)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "role_permissions: admin read"
  ON public.role_permissions FOR SELECT
  USING (public.current_user_role() = 'admin');

INSERT INTO public.role_permissions (role, resource, action, raci_type) VALUES
  ('admin',   'users',   'create',  'R'), ('manager', 'users',   'create',  'A'),
  ('teacher', 'users',   'create',  'I'), ('student', 'users',   'create',  'I'),
  ('admin',   'users',   'read',    'R'), ('manager', 'users',   'read',    'R'),
  ('teacher', 'users',   'read',    'C'), ('student', 'users',   'read',    'I'),
  ('admin',   'roles',   'assign',  'R'), ('manager', 'roles',   'assign',  'C'),
  ('teacher', 'roles',   'assign',  'I'), ('student', 'roles',   'assign',  'I'),
  ('admin',   'users',   'suspend', 'R'), ('manager', 'users',   'suspend', 'A'),
  ('teacher', 'users',   'suspend', 'I'), ('student', 'users',   'suspend', 'I'),
  ('admin',   'courses', 'create',  'R'), ('manager', 'courses', 'create',  'A'),
  ('teacher', 'courses', 'create',  'R'), ('student', 'courses', 'create',  'I'),
  ('admin',   'grades',  'read',    'R'), ('manager', 'grades',  'read',    'I'),
  ('teacher', 'grades',  'read',    'R'), ('student', 'grades',  'read',    'R'),
  ('admin',   'reports', 'run',     'R'), ('manager', 'reports', 'run',     'R'),
  ('teacher', 'reports', 'run',     'C'), ('student', 'reports', 'run',     'I'),
  ('admin',   'system',  'config',  'R'), ('manager', 'system',  'config',  'I'),
  ('teacher', 'system',  'config',  'I'), ('student', 'system',  'config',  'I')
ON CONFLICT (role, resource, action) DO NOTHING;

-- ─── PART 13: USER AUDIT LOG ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_uid  UUID        NOT NULL REFERENCES public.profiles(uid),
  target_uid UUID        NOT NULL REFERENCES public.profiles(uid),
  action     TEXT        NOT NULL,
  old_value  JSONB,
  new_value  JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_target  ON public.user_audit_log(target_uid);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON public.user_audit_log(actor_uid);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.user_audit_log(created_at DESC);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit: admin read"
  ON public.user_audit_log FOR SELECT
  USING (public.current_user_role() = 'admin');

CREATE POLICY "audit: self read"
  ON public.user_audit_log FOR SELECT
  USING (target_uid = public.current_user_uid());

-- Only service role may write audit records
CREATE POLICY "audit: system insert only"
  ON public.user_audit_log FOR INSERT
  WITH CHECK (false);

-- ─── PART 14: REBUILD ALL RLS POLICIES ───────────────────────────────────────
-- All policies now use current_user_uid() / current_user_role() helpers
-- instead of direct auth.uid() comparisons against domain columns.

-- ── profiles ──────────────────────────────────────────────────────────────────

CREATE POLICY "profiles: self read"
  ON public.profiles FOR SELECT
  USING (auth_id = auth.uid());

CREATE POLICY "profiles: admin manager read all"
  ON public.profiles FOR SELECT
  USING (public.current_user_role() IN ('admin', 'manager'));

CREATE POLICY "profiles: teacher read enrolled students"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_role() = 'teacher'
    AND uid IN (
      SELECT ce.user_id FROM public.course_enrollments ce
      JOIN public.courses c ON c.id = ce.course_id
      WHERE c.owner_id = public.current_user_uid()
    )
  );

CREATE POLICY "profiles: self update non-privileged fields"
  ON public.profiles FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
    AND role   = (SELECT role   FROM public.profiles WHERE auth_id = auth.uid())
    AND status = (SELECT status FROM public.profiles WHERE auth_id = auth.uid())
  );

CREATE POLICY "profiles: admin full update"
  ON public.profiles FOR UPDATE
  USING (public.current_user_role() = 'admin');

CREATE POLICY "profiles: admin insert"
  ON public.profiles FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

CREATE POLICY "profiles: no delete"
  ON public.profiles FOR DELETE
  USING (false);

-- ── profile_badges ────────────────────────────────────────────────────────────

CREATE POLICY "profile_badges: authenticated read"
  ON public.profile_badges FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "profile_badges: admin insert"
  ON public.profile_badges FOR INSERT
  WITH CHECK (public.current_user_role() = 'admin');

-- ── courses ───────────────────────────────────────────────────────────────────

CREATE POLICY "courses: visible to qualified users"
  ON public.courses FOR SELECT
  USING (
    public.current_user_role() IN ('admin', 'manager', 'teacher')
    OR (
      status = 'published'
      AND (SELECT current_level FROM public.profiles WHERE auth_id = auth.uid()) >= min_required_level
      AND (
        prerequisite_course_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.course_enrollments ce
          WHERE ce.user_id = public.current_user_uid() AND ce.course_id = prerequisite_course_id
        )
      )
    )
  );

CREATE POLICY "courses: teachers and admins can insert"
  ON public.courses FOR INSERT
  WITH CHECK (public.current_user_role() IN ('admin', 'teacher'));

CREATE POLICY "courses: owners and admins can update"
  ON public.courses FOR UPDATE
  USING (owner_id = public.current_user_uid() OR public.current_user_role() = 'admin');

CREATE POLICY "courses: owners and admins can delete"
  ON public.courses FOR DELETE
  USING (owner_id = public.current_user_uid() OR public.current_user_role() = 'admin');

-- ── enrollments (legacy) ──────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='enrollments') THEN
    EXECUTE 'CREATE POLICY "enrollments: self read" ON public.enrollments FOR SELECT USING (user_id = public.current_user_uid())';
    EXECUTE 'CREATE POLICY "enrollments: staff read" ON public.enrollments FOR SELECT USING (public.current_user_role() IN (''admin'', ''manager'', ''teacher''))';
    EXECUTE 'CREATE POLICY "enrollments: self enroll" ON public.enrollments FOR INSERT WITH CHECK (user_id = public.current_user_uid())';
  END IF;
END $$;

-- ── modules (legacy) ──────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='modules') THEN
    EXECUTE 'CREATE POLICY "modules: enrolled or staff read" ON public.modules FOR SELECT USING (public.current_user_role() IN (''admin'', ''manager'', ''teacher'') OR EXISTS (SELECT 1 FROM public.enrollments e WHERE e.user_id = public.current_user_uid() AND e.course_id = modules.course_id))';
    EXECUTE 'CREATE POLICY "modules: staff manage" ON public.modules FOR ALL USING (public.current_user_role() IN (''admin'', ''teacher''))';
  END IF;
END $$;

-- ── submissions (legacy) ──────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='submissions') THEN
    EXECUTE 'CREATE POLICY "submissions: self manage" ON public.submissions FOR ALL USING (student_id = public.current_user_uid()) WITH CHECK (student_id = public.current_user_uid())';
    EXECUTE 'CREATE POLICY "submissions: staff manage" ON public.submissions FOR ALL USING (public.current_user_role() IN (''admin'', ''teacher''))';
  END IF;
END $$;

-- ── organizations ─────────────────────────────────────────────────────────────

CREATE POLICY "organizations: admin manage"
  ON public.organizations FOR ALL
  USING (public.current_user_role() = 'admin');

CREATE POLICY "organizations: members read own org"
  ON public.organizations FOR SELECT
  USING (id = (SELECT org_id FROM public.profiles WHERE auth_id = auth.uid()));

-- ── course_blocks ─────────────────────────────────────────────────────────────

CREATE POLICY "course_blocks: staff view all"
  ON public.course_blocks FOR SELECT
  USING (public.current_user_role() IN ('admin', 'manager', 'teacher'));

CREATE POLICY "course_blocks: enrolled students view"
  ON public.course_blocks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.course_enrollments ce
      WHERE ce.user_id = public.current_user_uid() AND ce.course_id = course_blocks.course_id
      AND ce.status = 'active'
    )
  );

CREATE POLICY "course_blocks: owners manage"
  ON public.course_blocks FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_blocks.course_id AND c.owner_id = public.current_user_uid())
    OR public.current_user_role() = 'admin'
  );

-- ── course_enrollments ────────────────────────────────────────────────────────

CREATE POLICY "course_enrollments: self read"
  ON public.course_enrollments FOR SELECT
  USING (user_id = public.current_user_uid());

CREATE POLICY "course_enrollments: staff read"
  ON public.course_enrollments FOR SELECT
  USING (public.current_user_role() IN ('admin', 'manager', 'teacher'));

CREATE POLICY "course_enrollments: self enroll"
  ON public.course_enrollments FOR INSERT
  WITH CHECK (user_id = public.current_user_uid());

CREATE POLICY "course_enrollments: staff manage"
  ON public.course_enrollments FOR ALL
  USING (public.current_user_role() IN ('admin', 'manager'));

-- ── block_submissions ─────────────────────────────────────────────────────────

CREATE POLICY "block_submissions: students view own"
  ON public.block_submissions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.course_enrollments ce WHERE ce.id = block_submissions.enrollment_id AND ce.user_id = public.current_user_uid())
  );

CREATE POLICY "block_submissions: students submit"
  ON public.block_submissions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.course_enrollments ce WHERE ce.id = block_submissions.enrollment_id AND ce.user_id = public.current_user_uid())
  );

CREATE POLICY "block_submissions: staff view all"
  ON public.block_submissions FOR SELECT
  USING (public.current_user_role() IN ('admin', 'manager', 'teacher'));

-- ── hq_sessions ───────────────────────────────────────────────────────────────

CREATE POLICY "hq_sessions: users manage own"
  ON public.hq_sessions FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hq_sessions: admins read all"
  ON public.hq_sessions FOR SELECT
  USING (public.current_user_role() = 'admin');
