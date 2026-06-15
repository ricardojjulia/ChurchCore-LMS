-- ============================================================
-- Phase 1A: Academic Structure (ADR-2025-002)
-- program_tracks, academic_terms, course_blueprints,
-- course_sections, access_windows, meeting_schedules
-- ============================================================

-- ============================================================
-- PROGRAM TRACKS
-- ============================================================
CREATE TABLE IF NOT EXISTS program_tracks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  code        TEXT        NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE program_tracks ENABLE ROW LEVEL SECURITY;

-- Admin/manager: full access
CREATE POLICY "admin_manager_all_program_tracks" ON program_tracks
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

-- Everyone authenticated: read active tracks
CREATE POLICY "authenticated_read_active_program_tracks" ON program_tracks
  FOR SELECT
  USING (is_active = TRUE AND current_user_uid() IS NOT NULL);

-- ============================================================
-- ACADEMIC TERMS
-- ============================================================
CREATE TABLE IF NOT EXISTS academic_terms (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_term_id UUID        REFERENCES academic_terms(id) ON DELETE RESTRICT,
  term_name      TEXT        NOT NULL,
  term_code      TEXT        NOT NULL UNIQUE,
  type           TEXT        NOT NULL CHECK (type IN (
                               'academic_year','semester','trimester',
                               'quarter','block','ad_hoc','self_paced','series'
                             )),
  start_date     DATE        NOT NULL,
  end_date       DATE        NOT NULL,
  config         JSONB       NOT NULL DEFAULT '{}',
  depth          INTEGER     NOT NULL DEFAULT 0 CHECK (depth >= 0 AND depth <= 4),
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_term_dates CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_parent  ON academic_terms(parent_term_id);
CREATE INDEX IF NOT EXISTS idx_academic_terms_dates   ON academic_terms(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_academic_terms_active  ON academic_terms(is_active) WHERE is_active = TRUE;

ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_academic_terms" ON academic_terms
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "authenticated_read_active_academic_terms" ON academic_terms
  FOR SELECT
  USING (is_active = TRUE AND current_user_uid() IS NOT NULL);

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION handle_academic_terms_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_academic_terms_updated_at() FROM anon, public;

CREATE TRIGGER trg_academic_terms_updated_at
BEFORE UPDATE ON academic_terms
FOR EACH ROW EXECUTE FUNCTION handle_academic_terms_updated_at();

-- Trigger: auto-compute depth from parent
CREATE OR REPLACE FUNCTION compute_term_depth()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.parent_term_id IS NULL THEN
    NEW.depth := 0;
  ELSE
    SELECT depth + 1 INTO NEW.depth
    FROM academic_terms
    WHERE id = NEW.parent_term_id;

    IF NEW.depth > 4 THEN
      RAISE EXCEPTION 'Term hierarchy depth cannot exceed 4';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION compute_term_depth() FROM anon, public;

CREATE TRIGGER trg_compute_term_depth
BEFORE INSERT OR UPDATE OF parent_term_id ON academic_terms
FOR EACH ROW EXECUTE FUNCTION compute_term_depth();

-- ============================================================
-- TERM CONFIG RESOLUTION (walk hierarchy, child overrides parent)
-- ============================================================
CREATE OR REPLACE FUNCTION resolve_term_config(p_term_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ancestors UUID[];
  v_term_id   UUID := p_term_id;
  v_result    JSONB := '{}';
  v_config    JSONB;
BEGIN
  -- Collect ancestor chain root-first
  WHILE v_term_id IS NOT NULL LOOP
    v_ancestors := v_ancestors || v_term_id;
    SELECT parent_term_id INTO v_term_id
    FROM academic_terms WHERE id = v_term_id;
  END LOOP;

  -- Walk root-to-leaf so child overrides parent
  FOR i IN REVERSE array_length(v_ancestors, 1)..1 LOOP
    SELECT config INTO v_config
    FROM academic_terms WHERE id = v_ancestors[i];
    v_result := v_result || COALESCE(v_config, '{}');
  END LOOP;

  RETURN v_result;
END;
$$;
REVOKE EXECUTE ON FUNCTION resolve_term_config(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION resolve_term_config(UUID) TO authenticated;

-- ============================================================
-- COURSE BLUEPRINTS
-- ============================================================
CREATE TABLE IF NOT EXISTS course_blueprints (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  course_code      TEXT        NOT NULL UNIQUE,
  title            TEXT        NOT NULL,
  description      TEXT,
  credits          NUMERIC(4,2),
  program_track_id UUID        REFERENCES program_tracks(id) ON DELETE SET NULL,
  is_active        BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_blueprints_track  ON course_blueprints(program_track_id);
CREATE INDEX IF NOT EXISTS idx_course_blueprints_active ON course_blueprints(is_active) WHERE is_active = TRUE;

ALTER TABLE course_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_blueprints" ON course_blueprints
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_blueprints" ON course_blueprints
  FOR SELECT
  USING (current_user_role() = 'teacher' AND is_active = TRUE);

CREATE POLICY "learner_read_active_blueprints" ON course_blueprints
  FOR SELECT
  USING (current_user_role() IN ('student','guardian') AND is_active = TRUE);

-- Trigger: updated_at
CREATE OR REPLACE FUNCTION handle_blueprints_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_blueprints_updated_at() FROM anon, public;

CREATE TRIGGER trg_blueprints_updated_at
BEFORE UPDATE ON course_blueprints
FOR EACH ROW EXECUTE FUNCTION handle_blueprints_updated_at();

-- ============================================================
-- COURSE SECTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS course_sections (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id          UUID        NOT NULL REFERENCES course_blueprints(id) ON DELETE RESTRICT,
  term_id               UUID        NOT NULL REFERENCES academic_terms(id) ON DELETE RESTRICT,
  section_code          TEXT        NOT NULL,
  delivery_format       TEXT        NOT NULL CHECK (delivery_format IN (
                                      'synchronous','asynchronous','hybrid','self_paced'
                                    )),
  resolved_config       JSONB       NOT NULL DEFAULT '{}',
  max_enrollment        INTEGER     CHECK (max_enrollment > 0),
  enrollment_open_date  TIMESTAMPTZ,
  enrollment_close_date TIMESTAMPTZ,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blueprint_id, term_id, section_code)
);

CREATE INDEX IF NOT EXISTS idx_course_sections_blueprint ON course_sections(blueprint_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_term      ON course_sections(term_id);
CREATE INDEX IF NOT EXISTS idx_course_sections_active    ON course_sections(is_active) WHERE is_active = TRUE;

ALTER TABLE course_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_sections" ON course_sections
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_sections" ON course_sections
  FOR SELECT
  USING (current_user_role() = 'teacher' AND is_active = TRUE);

-- Learners see sections only via enrollment (checked via direct_enrollments in Phase 1B)
-- For now: learners can see active sections to browse catalog
CREATE POLICY "learner_read_active_sections" ON course_sections
  FOR SELECT
  USING (current_user_role() IN ('student','guardian') AND is_active = TRUE);

-- Trigger: snapshot resolved_config at section creation / term update
CREATE OR REPLACE FUNCTION snapshot_section_resolved_config()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.resolved_config := resolve_term_config(NEW.term_id);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION snapshot_section_resolved_config() FROM anon, public;

CREATE TRIGGER trg_section_resolved_config
BEFORE INSERT OR UPDATE OF term_id ON course_sections
FOR EACH ROW EXECUTE FUNCTION snapshot_section_resolved_config();

CREATE OR REPLACE FUNCTION handle_sections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_sections_updated_at() FROM anon, public;

CREATE TRIGGER trg_sections_updated_at
BEFORE UPDATE ON course_sections
FOR EACH ROW
WHEN (OLD.term_id IS NOT DISTINCT FROM NEW.term_id)
EXECUTE FUNCTION handle_sections_updated_at();

-- ============================================================
-- ACCESS WINDOWS (Content-gating security boundary)
-- ============================================================
CREATE TABLE IF NOT EXISTS access_windows (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID        NOT NULL UNIQUE REFERENCES course_sections(id) ON DELETE CASCADE,
  start_date TIMESTAMPTZ NOT NULL,
  end_date   TIMESTAMPTZ NOT NULL,
  grace_days INTEGER     NOT NULL DEFAULT 0 CHECK (grace_days >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_window CHECK (end_date > start_date)
);

CREATE INDEX IF NOT EXISTS idx_access_windows_dates ON access_windows(start_date, end_date);

ALTER TABLE access_windows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_access_windows" ON access_windows
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_access_windows" ON access_windows
  FOR SELECT
  USING (current_user_role() = 'teacher');

-- Learners must not see window boundaries directly — access is gated via check_section_access()
-- No learner SELECT policy on access_windows is intentional.

CREATE OR REPLACE FUNCTION handle_access_windows_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_access_windows_updated_at() FROM anon, public;

CREATE TRIGGER trg_access_windows_updated_at
BEFORE UPDATE ON access_windows
FOR EACH ROW EXECUTE FUNCTION handle_access_windows_updated_at();

-- Access check function (used by Phase 1B enrollment queries and content gates)
CREATE OR REPLACE FUNCTION check_section_access(p_section_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_start TIMESTAMPTZ;
  v_end   TIMESTAMPTZ;
  v_grace INTEGER;
BEGIN
  SELECT start_date, end_date, grace_days
  INTO   v_start, v_end, v_grace
  FROM   access_windows
  WHERE  section_id = p_section_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  RETURN NOW() >= v_start
     AND NOW() <= (v_end + (v_grace * INTERVAL '1 day'));
END;
$$;
REVOKE EXECUTE ON FUNCTION check_section_access(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION check_section_access(UUID) TO authenticated;

-- ============================================================
-- MEETING SCHEDULES (Calendar feature — sync/hybrid only)
-- ============================================================
CREATE TABLE IF NOT EXISTS meeting_schedules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id      UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  rrule           TEXT,
  start_time      TIME,
  end_time        TIME,
  timezone        TEXT        NOT NULL DEFAULT 'UTC',
  utc_start_time  TIMETZ,
  utc_end_time    TIMETZ,
  effective_from  DATE        NOT NULL,
  effective_until DATE,
  location_type   TEXT        CHECK (location_type IN ('physical','virtual','both')),
  location_detail TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_schedule_times CHECK (
    (start_time IS NULL AND end_time IS NULL) OR
    (start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
  ),
  CONSTRAINT sync_only_schedule CHECK (
    -- meeting_schedules only exist for sync/hybrid sections — enforced in trigger
    TRUE
  )
);

CREATE INDEX IF NOT EXISTS idx_meeting_schedules_section ON meeting_schedules(section_id);

ALTER TABLE meeting_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_meeting_schedules" ON meeting_schedules
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_read_meeting_schedules" ON meeting_schedules
  FOR SELECT
  USING (current_user_role() = 'teacher');

CREATE POLICY "learner_read_meeting_schedules" ON meeting_schedules
  FOR SELECT
  USING (current_user_role() IN ('student','guardian'));

-- Trigger: normalize local time to UTC on write + enforce sync-only constraint
CREATE OR REPLACE FUNCTION normalize_meeting_schedule_utc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_format TEXT;
BEGIN
  -- Enforce: meeting schedules only valid for synchronous/hybrid sections
  SELECT delivery_format INTO v_format
  FROM course_sections WHERE id = NEW.section_id;

  IF v_format NOT IN ('synchronous', 'hybrid') THEN
    RAISE EXCEPTION
      'meeting_schedules only allowed for synchronous or hybrid sections (section % is %)',
      NEW.section_id, v_format;
  END IF;

  -- Compute UTC equivalents from local time + timezone
  IF NEW.start_time IS NOT NULL AND NEW.timezone IS NOT NULL THEN
    NEW.utc_start_time := (
      (CURRENT_DATE + NEW.start_time) AT TIME ZONE NEW.timezone
    )::TIMETZ;
    NEW.utc_end_time := (
      (CURRENT_DATE + NEW.end_time) AT TIME ZONE NEW.timezone
    )::TIMETZ;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION normalize_meeting_schedule_utc() FROM anon, public;

CREATE TRIGGER trg_normalize_meeting_schedule
BEFORE INSERT OR UPDATE OF start_time, end_time, timezone, section_id
ON meeting_schedules
FOR EACH ROW EXECUTE FUNCTION normalize_meeting_schedule_utc();
