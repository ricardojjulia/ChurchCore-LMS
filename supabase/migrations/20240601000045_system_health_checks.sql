-- ============================================================
-- Migration 045: System health checks table
--
-- Provides a persistent audit trail for scheduled and on-demand
-- health checks run by the system-health-check Edge Function.
-- Admins can query this table from the SystemHealthPanel UI.
--
-- RLS:
--   • admin/manager can SELECT all rows
--   • No direct INSERT/UPDATE by clients — all writes go through
--     the Edge Function using the service role key
-- ============================================================

CREATE TABLE IF NOT EXISTS system_health_checks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  check_name  TEXT        NOT NULL,
  status      TEXT        NOT NULL CHECK (status IN ('ok', 'warning', 'error', 'unknown')),
  message     TEXT,
  details     JSONB       DEFAULT '{}'::JSONB,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_health_checks_check_name_idx
  ON system_health_checks (check_name, checked_at DESC);

ALTER TABLE system_health_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_health_checks" ON system_health_checks;
CREATE POLICY "admin_read_health_checks" ON system_health_checks
  FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'manager'));

-- Clients never write directly — Edge Function uses service role.
-- Revoke would be redundant (no INSERT/UPDATE/DELETE policies exist).

DO $$
BEGIN
  RAISE NOTICE 'Migration 045: system_health_checks table ready';
END;
$$;
