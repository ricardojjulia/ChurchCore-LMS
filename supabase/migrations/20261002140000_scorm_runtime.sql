-- ─── SCORM 1.2 / 2004 Runtime Tables and RLS (COUNCIL-2026-042) ────────────

-- 1. SCORM Packages (uploaded package metadata & manifest details)
CREATE TABLE IF NOT EXISTS public.scorm_packages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  block_id        UUID NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
  version         TEXT NOT NULL CHECK (version IN ('1.2', '2004')),
  title           TEXT NOT NULL,
  launch_path     TEXT NOT NULL,
  package_path    TEXT NOT NULL,
  package_filename TEXT,
  manifest_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  mastery_score   NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorm_packages_block ON public.scorm_packages(block_id);
CREATE INDEX IF NOT EXISTS idx_scorm_packages_org ON public.scorm_packages(org_id);

-- 2. SCORM Attempts (per-learner CMI runtime data, scoring, suspend data)
CREATE TABLE IF NOT EXISTS public.scorm_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  block_id        UUID NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'incomplete' CHECK (status IN ('not attempted', 'incomplete', 'completed', 'passed', 'failed')),
  score_raw       NUMERIC,
  score_min       NUMERIC,
  score_max       NUMERIC,
  score_scaled    NUMERIC,
  session_time    TEXT,
  total_time      TEXT,
  suspend_data    TEXT,
  lesson_location TEXT,
  cmi_data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_scorm_attempts_block_user UNIQUE (block_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_scorm_attempts_block_user ON public.scorm_attempts(block_id, user_id);
CREATE INDEX IF NOT EXISTS idx_scorm_attempts_org ON public.scorm_attempts(org_id);

-- 3. RLS on scorm_packages
ALTER TABLE public.scorm_packages ENABLE ROW LEVEL SECURITY;

-- Admins, managers, teachers can manage packages in their org
CREATE POLICY "Staff manage scorm packages in org"
  ON public.scorm_packages
  FOR ALL
  TO authenticated
  USING (
    org_id = (SELECT p.org_id FROM public.profiles p WHERE p.auth_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.profile_roles pr
        JOIN public.profiles p ON p.uid = pr.profile_id
        WHERE p.auth_id = auth.uid()
        AND pr.role IN ('admin', 'manager', 'teacher', 'superadmin')
      )
    )
  );

-- Enrolled learners can read scorm package records for courses they take
CREATE POLICY "Learners read scorm packages"
  ON public.scorm_packages
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT p.org_id FROM public.profiles p WHERE p.auth_id = auth.uid())
  );

-- 4. RLS on scorm_attempts
ALTER TABLE public.scorm_attempts ENABLE ROW LEVEL SECURITY;

-- Learners manage their own attempts
CREATE POLICY "Learners manage own scorm attempts"
  ON public.scorm_attempts
  FOR ALL
  TO authenticated
  USING (
    user_id = (SELECT p.uid FROM public.profiles p WHERE p.auth_id = auth.uid())
  )
  WITH CHECK (
    user_id = (SELECT p.uid FROM public.profiles p WHERE p.auth_id = auth.uid())
  );

-- Teachers/Managers/Admins view attempts in their org
CREATE POLICY "Staff view scorm attempts in org"
  ON public.scorm_attempts
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT p.org_id FROM public.profiles p WHERE p.auth_id = auth.uid())
    AND (
      EXISTS (
        SELECT 1 FROM public.profile_roles pr
        JOIN public.profiles p ON p.uid = pr.profile_id
        WHERE p.auth_id = auth.uid()
        AND pr.role IN ('admin', 'manager', 'teacher', 'superadmin')
      )
    )
  );

-- Ensure SCORM block type is marked active in block_types table
UPDATE public.block_types
SET is_active = TRUE
WHERE id = 'scorm';
