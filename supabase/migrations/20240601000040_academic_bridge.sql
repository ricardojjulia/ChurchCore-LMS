-- ============================================================
-- Migration 040: Academic Structure ↔ Course Delivery Bridge
--
-- The academic structure (blueprints → sections → terms → cohorts)
-- was built in migrations 035–037. The course delivery system
-- (courses → enrollments → course_blocks) predates it. This
-- migration connects the two so that:
--   1. A course can be linked to a blueprint (optional).
--   2. When a student is enrolled in a section via direct_enrollments,
--      they are automatically enrolled in the blueprint's course.
--   3. Withdrawal from a section propagates to the course enrollment.
-- ============================================================

-- ── 1. Link courses to blueprints ─────────────────────────────────────
-- Admin sets blueprint_id on courses that deliver a blueprint's content.
-- Nullable: standalone courses without an academic blueprint still work.

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS blueprint_id UUID
    REFERENCES course_blueprints(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_courses_blueprint_id
  ON courses(blueprint_id)
  WHERE blueprint_id IS NOT NULL;

-- ── 2. Track section origin on course enrollments ─────────────────────
-- Set when enrollment was created by the academic bridge (not self-enroll).
-- Nullable: self-enrolled or staff-enrolled courses have no section.

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS section_id UUID
    REFERENCES course_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_enrollments_section_id
  ON enrollments(section_id)
  WHERE section_id IS NOT NULL;

-- ── 3. Bridge trigger: section enrollment → course enrollment ──────────
-- When a student is added to direct_enrollments with status='active',
-- check if the section's blueprint has a linked course. If so, create
-- (or update) a corresponding enrollments record.

CREATE OR REPLACE FUNCTION bridge_section_to_course_enrollment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_course_id UUID;
BEGIN
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_course_id
  FROM courses c
  JOIN course_sections cs ON cs.blueprint_id = c.blueprint_id
  WHERE cs.id = NEW.section_id
    AND c.blueprint_id IS NOT NULL
  LIMIT 1;

  IF v_course_id IS NOT NULL THEN
    INSERT INTO enrollments (user_id, course_id, section_id, transit_status, progress_percent)
    VALUES (NEW.user_id, v_course_id, NEW.section_id, 'not_started', 0)
    ON CONFLICT (user_id, course_id) DO UPDATE
      SET section_id = EXCLUDED.section_id
      WHERE enrollments.section_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bridge_section_to_course ON direct_enrollments;
CREATE TRIGGER trg_bridge_section_to_course
  AFTER INSERT ON direct_enrollments
  FOR EACH ROW EXECUTE FUNCTION bridge_section_to_course_enrollment();

-- ── 4. Withdrawal sync: section withdrawal → course dropped ───────────
-- When a direct_enrollment transitions from 'active' to 'withdrawn',
-- mark the corresponding course enrollment as 'dropped'.
-- Does NOT affect completed enrollments (don't revoke earned completion).

CREATE OR REPLACE FUNCTION sync_section_withdrawal_to_course()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status = 'active' THEN
    UPDATE enrollments
    SET transit_status = 'dropped'
    WHERE user_id      = NEW.user_id
      AND section_id   = NEW.section_id
      AND transit_status NOT IN ('completed', 'dropped');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_section_withdrawal ON direct_enrollments;
CREATE TRIGGER trg_sync_section_withdrawal
  AFTER UPDATE OF status ON direct_enrollments
  FOR EACH ROW EXECUTE FUNCTION sync_section_withdrawal_to_course();

-- ── 5. Back-fill: link any existing enrollments that match by section ──
-- For cohort members who were enrolled in sections before this migration,
-- set section_id on their existing enrollment if a matching course exists.

UPDATE enrollments e
SET section_id = de.section_id
FROM direct_enrollments de
JOIN course_sections cs ON cs.id = de.section_id
JOIN courses c          ON c.blueprint_id = cs.blueprint_id
WHERE de.user_id   = e.user_id
  AND c.id         = e.course_id
  AND e.section_id IS NULL
  AND de.status    = 'active';
