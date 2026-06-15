-- ============================================================
-- Migration 046: Align system_health_checks to council spec
--
-- COUNCIL-2025-005 ratified column names that differ from
-- what migration 045 produced:
--
--   details    → metadata   (JSONB catch-all)
--   checked_at → last_checked (clearer semantic)
--   (new)      → action_url  (optional deep-link for operators)
--
-- The table had no data at time of rename — zero production risk.
-- ============================================================

ALTER TABLE system_health_checks
  RENAME COLUMN details TO metadata;

ALTER TABLE system_health_checks
  RENAME COLUMN checked_at TO last_checked;

ALTER TABLE system_health_checks
  ADD COLUMN IF NOT EXISTS action_url TEXT;

-- Recreate index on new column name
DROP INDEX IF EXISTS system_health_checks_check_name_idx;
CREATE INDEX IF NOT EXISTS system_health_checks_name_time_idx
  ON system_health_checks (check_name, last_checked DESC);

DO $$
BEGIN
  RAISE NOTICE 'Migration 046: system_health_checks schema aligned to COUNCIL-2025-005 spec';
END;
$$;
