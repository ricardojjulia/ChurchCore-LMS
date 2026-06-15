-- ============================================================
-- Migration 043: Backfill cohort bridge enrollments
--
-- Migration 040 added the bridge triggers (direct_enrollment →
-- enrollment) and backfill of FUTURE rows only. This migration
-- backfills existing active direct_enrollment rows that have no
-- corresponding course enrollment.
--
-- Safety:
--   • Idempotent — uses INSERT ... ON CONFLICT DO NOTHING
--   • Only processes active direct_enrollments
--   • Does not touch withdrawn students
--   • Requires courses.blueprint_id (added in 040) to be set
--   • Batched in 500-row slices via a DO loop
--
-- Also establishes RLS policies for course_blueprints so that
-- BlueprintSelector (GAP-001 UI) can read them.
-- ============================================================

-- ── 1. Ensure the columns added in 040 exist ──────────────────────────────────
-- (ALTER TABLE ... IF NOT EXISTS makes these safe to re-run)

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS blueprint_id UUID
    REFERENCES course_blueprints(id) ON DELETE SET NULL;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS section_id UUID
    REFERENCES course_sections(id) ON DELETE SET NULL;

-- ── 2. RLS policies for course_blueprints ─────────────────────────────────────

ALTER TABLE course_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_blueprints" ON course_blueprints;
CREATE POLICY "admin_manage_blueprints" ON course_blueprints
  FOR ALL TO authenticated
  USING  (current_user_role() IN ('admin', 'manager'))
  WITH CHECK (current_user_role() IN ('admin', 'manager'));

DROP POLICY IF EXISTS "instructor_read_active_blueprints" ON course_blueprints;
CREATE POLICY "instructor_read_active_blueprints" ON course_blueprints
  FOR SELECT TO authenticated
  USING (
    current_user_role() IN ('admin', 'manager', 'teacher')
    -- Teachers only see blueprints linked to their own courses
    AND (
      current_user_role() IN ('admin', 'manager')
      OR EXISTS (
        SELECT 1 FROM courses c
        WHERE c.blueprint_id = course_blueprints.id
          AND c.owner_id = current_user_uid()
      )
    )
  );

-- ── 3. Backfill loop ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_batch_size  INT := 500;
  v_offset      INT := 0;
  v_inserted    INT := 0;
  v_total       INT := 0;
  v_loop_count  INT := 0;
  v_max_loops   INT := 2000; -- safety cap (2000 × 500 = 1M rows max)
BEGIN
  LOOP
    v_loop_count := v_loop_count + 1;
    IF v_loop_count > v_max_loops THEN
      RAISE EXCEPTION 'Backfill exceeded safety cap of % iterations', v_max_loops;
    END IF;

    WITH candidates AS (
      SELECT
        de.user_id,
        c.id             AS course_id,
        de.section_id,
        de.enrolled_at
      FROM direct_enrollments de
      JOIN course_sections cs ON cs.id = de.section_id
      JOIN courses          c  ON c.blueprint_id = cs.blueprint_id
      WHERE de.status = 'active'
        AND c.blueprint_id IS NOT NULL
      ORDER BY de.enrolled_at
      LIMIT  v_batch_size
      OFFSET v_offset
    ),
    inserted AS (
      INSERT INTO enrollments (user_id, course_id, section_id, transit_status, progress_percent)
      SELECT
        user_id,
        course_id,
        section_id,
        'not_started',
        0
      FROM candidates
      ON CONFLICT (user_id, course_id) DO NOTHING
      RETURNING id
    )
    SELECT COUNT(*) INTO v_inserted FROM inserted;

    v_total  := v_total + v_inserted;
    v_offset := v_offset + v_batch_size;

    -- Stop when the batch returned no candidates
    IF v_inserted = 0 THEN
      EXIT;
    END IF;
  END LOOP;

  RAISE NOTICE 'Migration 043: backfilled % enrollment rows', v_total;
END;
$$;
