-- ═══════════════════════════════════════════════════════════════════════
-- Migration 023: Dashboard Phase 1 — Course transit states + Notifications
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Extend enrollments with transit tracking ────────────────────────

ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS transit_status   TEXT NOT NULL DEFAULT 'not_started'
    CHECK (transit_status IN ('not_started','in_progress','completed','dropped','paused')),
  ADD COLUMN IF NOT EXISTS progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0.00
    CHECK (progress_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;

-- Back-fill: any enrollment with a submission counts as in_progress
UPDATE public.enrollments e
SET transit_status = 'in_progress'
WHERE transit_status = 'not_started'
  AND EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.student_id = e.user_id
      AND s.course_id  = e.course_id
  );

CREATE INDEX IF NOT EXISTS idx_enrollments_user_transit
  ON public.enrollments(user_id, transit_status);

-- ── 2. Extend profiles with dashboard preferences ──────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dashboard_layout   JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{"badge":true,"sound":false,"email_digest":"daily"}',
  ADD COLUMN IF NOT EXISTS timezone           TEXT  NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS last_seen_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_online          BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 3. Notifications table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN (
                   'message_received','announcement','assignment_graded',
                   'assignment_due_soon','course_enrollment',
                   'certificate_earned','grade_posted','system'
                 )),
  title          TEXT NOT NULL,
  body           TEXT,
  link           TEXT,
  reference_type TEXT,
  reference_id   UUID,
  is_read        BOOLEAN NOT NULL DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  is_dismissed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users own their notifications — strict
CREATE POLICY "notifications: user owns"
  ON public.notifications FOR ALL TO authenticated
  USING (user_id = current_user_uid())
  WITH CHECK (user_id = current_user_uid());

-- System / server-role inserts (service_role bypasses RLS)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_unread_only
  ON public.notifications(user_id)
  WHERE is_read = FALSE AND is_dismissed = FALSE;
