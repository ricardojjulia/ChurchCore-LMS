-- Guardian notification retry / dead-letter — ADR-2026-010
--
-- Today `send-guardian-notifications` marks every queue row `sent_at`
-- unconditionally once it's been processed, even when the Resend call itself
-- failed — the only trace of a real failure is a console.error line in the
-- Edge Function logs. A guardian can silently never be told their child
-- received a grade, with nothing queryable to catch it.
--
-- This adds a bounded retry: a genuinely failed send leaves the row eligible
-- for the next cron tick (up to MAX_ATTEMPTS, enforced in the Edge Function)
-- instead of being marked "sent", and after the limit is exhausted the row is
-- dead-lettered (failed_at set) rather than silently dropped or retried
-- forever. Platform admins gain read access to see dead-lettered rows —
-- previously this table had zero authenticated-role access at all.

ALTER TABLE public.guardian_notification_queue
  ADD COLUMN IF NOT EXISTS attempt_count integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error    text,
  ADD COLUMN IF NOT EXISTS failed_at     timestamptz;

-- Dead-lettered rows (failed_at set) must not be picked up again by the
-- "still needs sending" query.
DROP INDEX IF EXISTS idx_guardian_notification_queue_unsent;
CREATE INDEX idx_guardian_notification_queue_unsent
  ON public.guardian_notification_queue (debounce_until, sent_at)
  WHERE sent_at IS NULL AND failed_at IS NULL;

-- Platform admins can see stuck/dead-lettered notifications. Still no INSERT/
-- UPDATE/DELETE grant for authenticated — writes remain service-role only via
-- the Edge Function, matching the existing "service only" policy below.
CREATE POLICY "guardian_notification_queue: platform admin read"
  ON public.guardian_notification_queue FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
