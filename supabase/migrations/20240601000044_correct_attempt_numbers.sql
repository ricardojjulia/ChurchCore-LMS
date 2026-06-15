-- ============================================================
-- Migration 044: Correct attempt_number in block_submissions
--
-- The submitAssignment server action had a bug: it used
-- `existing ? 2 : 1` instead of counting prior attempts,
-- so resubmissions always wrote attempt_number = 2 regardless
-- of how many prior submissions existed.
--
-- This migration recomputes attempt_number for every non-deleted
-- submission using ROW_NUMBER() partitioned by (user_id, block_id)
-- ordered by submitted_at ASC.
--
-- Idempotent: running twice produces the same result.
-- ============================================================

UPDATE block_submissions bs
SET attempt_number = recomputed.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, block_id
      ORDER BY submitted_at ASC, id ASC
    ) AS rn
  FROM block_submissions
  WHERE is_deleted = FALSE
) AS recomputed
WHERE bs.id = recomputed.id
  AND bs.attempt_number IS DISTINCT FROM recomputed.rn;

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM block_submissions
  WHERE is_deleted = FALSE AND attempt_number IS NULL;

  IF v_count > 0 THEN
    RAISE WARNING 'Migration 044: % non-deleted submissions still have NULL attempt_number', v_count;
  ELSE
    RAISE NOTICE 'Migration 044: attempt_number corrections applied successfully';
  END IF;
END;
$$;
