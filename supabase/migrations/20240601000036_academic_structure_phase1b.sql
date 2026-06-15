-- ============================================================
-- Phase 1B: Enrollment Engine (ADR-2025-002)
-- global_cohorts, cohort_members, enrollment_jobs,
-- cohort_section_enrollments, direct_enrollments,
-- enrollment_audit_log, effective_enrollments view
-- ============================================================
-- Gate: Phase 1A pgTAP tests must pass before this runs.
-- ============================================================

-- ============================================================
-- GLOBAL COHORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS global_cohorts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_name      TEXT        NOT NULL,
  cohort_code      TEXT        NOT NULL UNIQUE,
  program_track_id UUID        REFERENCES program_tracks(id) ON DELETE SET NULL,
  description      TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_cohorts_track  ON global_cohorts(program_track_id);
CREATE INDEX IF NOT EXISTS idx_global_cohorts_active ON global_cohorts(is_active) WHERE is_active = TRUE;

ALTER TABLE global_cohorts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_cohorts" ON global_cohorts
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

-- Teachers can see cohorts for reporting; cannot modify
CREATE POLICY "teacher_read_cohorts" ON global_cohorts
  FOR SELECT
  USING (current_user_role() = 'teacher' AND is_active = TRUE);

CREATE OR REPLACE FUNCTION handle_cohorts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_cohorts_updated_at() FROM anon, public;

CREATE TRIGGER trg_cohorts_updated_at
BEFORE UPDATE ON global_cohorts
FOR EACH ROW EXECUTE FUNCTION handle_cohorts_updated_at();

-- ============================================================
-- COHORT MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID        NOT NULL REFERENCES global_cohorts(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status    TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','suspended','withdrawn','completed')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at TIMESTAMPTZ,
  notes     TEXT,
  UNIQUE (cohort_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cohort_members_cohort ON cohort_members(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_user   ON cohort_members(user_id);
CREATE INDEX IF NOT EXISTS idx_cohort_members_status ON cohort_members(status);

ALTER TABLE cohort_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_cohort_members" ON cohort_members
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_cohort_members" ON cohort_members
  FOR SELECT
  USING (current_user_role() = 'teacher');

-- Students can read their own cohort membership only
CREATE POLICY "learner_read_own_cohort_membership" ON cohort_members
  FOR SELECT
  USING (user_id = current_user_uid());

-- ============================================================
-- ENROLLMENT JOBS (Bulk operation tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollment_jobs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id         UUID        NOT NULL REFERENCES global_cohorts(id) ON DELETE RESTRICT,
  section_id        UUID        NOT NULL REFERENCES course_sections(id) ON DELETE RESTRICT,
  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','dry_run','processing',
                        'completed','failed','partial'
                      )),
  dry_run           BOOLEAN     NOT NULL DEFAULT FALSE,
  total_members     INTEGER,
  processed_count   INTEGER     NOT NULL DEFAULT 0,
  skipped_count     INTEGER     NOT NULL DEFAULT 0,
  failed_count      INTEGER     NOT NULL DEFAULT 0,
  last_batch_cursor UUID,
  result_summary    JSONB,
  initiated_by      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrollment_jobs_cohort  ON enrollment_jobs(cohort_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_jobs_section ON enrollment_jobs(section_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_jobs_status  ON enrollment_jobs(status);

ALTER TABLE enrollment_jobs ENABLE ROW LEVEL SECURITY;

-- Only admin/manager can initiate or read jobs
CREATE POLICY "admin_manager_all_enrollment_jobs" ON enrollment_jobs
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

-- ============================================================
-- COHORT → SECTION ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS cohort_section_enrollments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id       UUID        NOT NULL REFERENCES global_cohorts(id) ON DELETE CASCADE,
  section_id      UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  job_id          UUID        REFERENCES enrollment_jobs(id) ON DELETE SET NULL,
  enrolled_by     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_override JSONB       NOT NULL DEFAULT '{}',
  UNIQUE (cohort_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_cse_cohort  ON cohort_section_enrollments(cohort_id);
CREATE INDEX IF NOT EXISTS idx_cse_section ON cohort_section_enrollments(section_id);

ALTER TABLE cohort_section_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_cse" ON cohort_section_enrollments
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_cse" ON cohort_section_enrollments
  FOR SELECT
  USING (current_user_role() = 'teacher');

-- ============================================================
-- DIRECT ENROLLMENTS (State machine enforced)
-- ============================================================
CREATE TABLE IF NOT EXISTS direct_enrollments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id        UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  status            TEXT        NOT NULL DEFAULT 'pending'
                      CHECK (status IN (
                        'pending','active','suspended','withdrawn','completed'
                      )),
  source            TEXT        NOT NULL DEFAULT 'direct'
                      CHECK (source IN ('direct','cohort','api','import')),
  source_cohort_id  UUID        REFERENCES global_cohorts(id) ON DELETE SET NULL,
  enrolled_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  enrolled_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  retain_data_until TIMESTAMPTZ,
  UNIQUE (user_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_direct_enrollments_user    ON direct_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_direct_enrollments_section ON direct_enrollments(section_id);
CREATE INDEX IF NOT EXISTS idx_direct_enrollments_status  ON direct_enrollments(status);

ALTER TABLE direct_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_direct_enrollments" ON direct_enrollments
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_direct_enrollments" ON direct_enrollments
  FOR SELECT
  USING (current_user_role() = 'teacher');

-- Students read own enrollment only (status included — they need to know their state)
CREATE POLICY "learner_read_own_enrollment" ON direct_enrollments
  FOR SELECT
  USING (user_id = current_user_uid());

-- Students cannot UPDATE their own enrollment status
-- (no UPDATE policy for learner — enforced by absence)

-- ============================================================
-- ENROLLMENT AUDIT LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollment_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID        NOT NULL REFERENCES direct_enrollments(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL,
  section_id    UUID        NOT NULL,
  from_status   TEXT,
  to_status     TEXT        NOT NULL,
  changed_by    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason        TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_enrollment ON enrollment_audit_log(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_audit_user       ON enrollment_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed_at ON enrollment_audit_log(changed_at DESC);

ALTER TABLE enrollment_audit_log ENABLE ROW LEVEL SECURITY;

-- Audit log is append-only; only admin/manager can read; nobody can update/delete
CREATE POLICY "admin_manager_read_audit_log" ON enrollment_audit_log
  FOR SELECT
  USING (current_user_role() IN ('admin','manager'));

CREATE POLICY "system_insert_audit_log" ON enrollment_audit_log
  FOR INSERT
  WITH CHECK (TRUE);

-- ============================================================
-- STATE MACHINE TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION enforce_enrollment_state_machine()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- No-op if status unchanged
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  -- Reject transitions out of terminal states
  IF OLD.status IN ('completed', 'withdrawn') THEN
    RAISE EXCEPTION
      'Enrollment % is in terminal state "%" and cannot be transitioned to "%"',
      OLD.id, OLD.status, NEW.status;
  END IF;

  -- Valid transitions
  IF NOT (
    (OLD.status = 'pending'   AND NEW.status IN ('active', 'withdrawn')) OR
    (OLD.status = 'active'    AND NEW.status IN ('suspended', 'withdrawn', 'completed')) OR
    (OLD.status = 'suspended' AND NEW.status IN ('active', 'withdrawn'))
  ) THEN
    RAISE EXCEPTION
      'Invalid enrollment transition: "%" → "%"', OLD.status, NEW.status;
  END IF;

  -- Timestamp terminal transitions
  IF NEW.status = 'completed' THEN
    NEW.completed_at := NOW();
  END IF;
  IF NEW.status = 'withdrawn' THEN
    NEW.withdrawn_at      := NOW();
    NEW.retain_data_until := NOW() + INTERVAL '7 years';
  END IF;

  -- Mandatory audit entry
  INSERT INTO enrollment_audit_log
    (enrollment_id, user_id, section_id, from_status, to_status, changed_by)
  VALUES
    (NEW.id, NEW.user_id, NEW.section_id, OLD.status, NEW.status,
     COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION enforce_enrollment_state_machine() FROM anon, public;

CREATE TRIGGER trg_enrollment_state_machine
BEFORE UPDATE OF status ON direct_enrollments
FOR EACH ROW EXECUTE FUNCTION enforce_enrollment_state_machine();

-- Prevent application code from writing source column directly
CREATE OR REPLACE FUNCTION lock_enrollment_source()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source IS DISTINCT FROM NEW.source THEN
    RAISE EXCEPTION 'enrollment.source is immutable after insert';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION lock_enrollment_source() FROM anon, public;

CREATE TRIGGER trg_lock_enrollment_source
BEFORE UPDATE OF source ON direct_enrollments
FOR EACH ROW EXECUTE FUNCTION lock_enrollment_source();

-- ============================================================
-- EFFECTIVE ENROLLMENTS — materialized view
-- Refreshed by refresh_effective_enrollments() + pg_cron
-- ============================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS effective_enrollments AS
SELECT
  de.id             AS enrollment_id,
  de.user_id,
  de.section_id,
  de.status,
  de.source,
  de.source_cohort_id,
  de.enrolled_at,
  aw.start_date     AS access_start,
  aw.end_date       AS access_end,
  aw.grace_days,
  (
    de.status = 'active'
    AND NOW() >= aw.start_date
    AND NOW() <= (aw.end_date + (aw.grace_days * INTERVAL '1 day'))
  ) AS has_active_access
FROM direct_enrollments de
JOIN access_windows aw ON aw.section_id = de.section_id
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_effective_enrollments
  ON effective_enrollments(user_id, section_id);

CREATE INDEX IF NOT EXISTS idx_effective_enrollments_section
  ON effective_enrollments(section_id);

CREATE INDEX IF NOT EXISTS idx_effective_enrollments_access
  ON effective_enrollments(has_active_access) WHERE has_active_access = TRUE;

-- Refresh function (called by admin or pg_cron)
CREATE OR REPLACE FUNCTION refresh_effective_enrollments()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY effective_enrollments;
END;
$$;
REVOKE EXECUTE ON FUNCTION refresh_effective_enrollments() FROM anon, public;
GRANT  EXECUTE ON FUNCTION refresh_effective_enrollments() TO authenticated;

-- ============================================================
-- BULK ENROLLMENT HELPER (called by the API route)
-- Returns a JSONB summary; dry_run = true means no writes
-- Processes in batches of 50; idempotent via ON CONFLICT DO NOTHING
-- ============================================================
CREATE OR REPLACE FUNCTION bulk_enroll_cohort(
  p_job_id    UUID,
  p_cohort_id UUID,
  p_section_id UUID,
  p_dry_run   BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_total       INTEGER := 0;
  v_enrolled    INTEGER := 0;
  v_skipped     INTEGER := 0;
  v_failed      INTEGER := 0;
  v_member      RECORD;
  v_err         TEXT;
  v_cursor      UUID;
  v_result      JSONB;
BEGIN
  -- Only admin/manager may call
  IF current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'bulk_enroll_cohort: insufficient privileges';
  END IF;

  -- Mark job as processing
  IF NOT p_dry_run THEN
    UPDATE enrollment_jobs
    SET status = 'processing', started_at = NOW()
    WHERE id = p_job_id;
  END IF;

  -- Count eligible members
  SELECT COUNT(*) INTO v_total
  FROM cohort_members
  WHERE cohort_id = p_cohort_id AND status = 'active';

  UPDATE enrollment_jobs SET total_members = v_total WHERE id = p_job_id;

  -- Iterate active members
  FOR v_member IN
    SELECT cm.user_id
    FROM cohort_members cm
    WHERE cm.cohort_id = p_cohort_id AND cm.status = 'active'
    ORDER BY cm.user_id  -- deterministic order for cursor resumption
  LOOP
    v_cursor := v_member.user_id;

    BEGIN
      IF p_dry_run THEN
        -- Dry-run: just count what would happen
        IF EXISTS (
          SELECT 1 FROM direct_enrollments
          WHERE user_id = v_member.user_id AND section_id = p_section_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_enrolled := v_enrolled + 1;
        END IF;
      ELSE
        INSERT INTO direct_enrollments
          (user_id, section_id, status, source, source_cohort_id, enrolled_by)
        VALUES
          (v_member.user_id, p_section_id, 'active', 'cohort', p_cohort_id, auth.uid())
        ON CONFLICT (user_id, section_id) DO NOTHING;

        IF FOUND THEN
          v_enrolled := v_enrolled + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
      v_failed := v_failed + 1;
    END;

    -- Update progress cursor every 50 rows
    IF (v_enrolled + v_skipped + v_failed) % 50 = 0 AND NOT p_dry_run THEN
      UPDATE enrollment_jobs
      SET processed_count   = v_enrolled,
          skipped_count     = v_skipped,
          failed_count      = v_failed,
          last_batch_cursor = v_cursor
      WHERE id = p_job_id;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'total',    v_total,
    'enrolled', v_enrolled,
    'skipped',  v_skipped,
    'failed',   v_failed,
    'dry_run',  p_dry_run
  );

  -- Finalize job
  IF NOT p_dry_run THEN
    UPDATE enrollment_jobs
    SET status          = CASE WHEN v_failed > 0 THEN 'partial' ELSE 'completed' END,
        processed_count = v_enrolled,
        skipped_count   = v_skipped,
        failed_count    = v_failed,
        result_summary  = v_result,
        completed_at    = NOW()
    WHERE id = p_job_id;

    -- Refresh materialized view after bulk operation
    PERFORM refresh_effective_enrollments();
  ELSE
    UPDATE enrollment_jobs
    SET status = 'dry_run', result_summary = v_result
    WHERE id = p_job_id;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION bulk_enroll_cohort(UUID, UUID, UUID, BOOLEAN) FROM anon, public;
GRANT  EXECUTE ON FUNCTION bulk_enroll_cohort(UUID, UUID, UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- pg_cron: refresh effective_enrollments every 5 minutes
-- Requires pg_cron extension (Supabase Pro / self-hosted with pg_cron)
-- Uncomment if pg_cron is available:
-- ============================================================
-- SELECT cron.schedule(
--   'refresh-effective-enrollments',
--   '*/5 * * * *',
--   $$ SELECT refresh_effective_enrollments(); $$
-- );
