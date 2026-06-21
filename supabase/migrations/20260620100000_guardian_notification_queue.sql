-- Guardian Notification Queue
-- COUNCIL-2026-001: DB-trigger → queue-table → Edge Function pipeline
-- Emails guardians when their ward completes a course or earns a badge.
--
-- Column facts confirmed from migrations before writing:
--   course_enrollments.user_id  → profiles(uid)  (migrated in 20240601000005)
--   profile_badges.profile_id   → profiles(uid)  (initial schema + maintenance)
--   badges.title                → badge name column
--   guardian_links.student_uid  → profiles(uid)

-- ─── TABLE ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.guardian_notification_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_uid    UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  event_type     TEXT NOT NULL CHECK (event_type IN ('course_completed', 'badge_awarded')),
  payload        JSONB NOT NULL DEFAULT '{}',
  debounce_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.guardian_notification_queue ENABLE ROW LEVEL SECURITY;

-- Service role only — authenticated users have no direct access to the queue.
-- The Edge Function uses SUPABASE_SERVICE_ROLE_KEY to read and update rows.
CREATE POLICY "guardian_notification_queue: service only"
  ON public.guardian_notification_queue FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX idx_guardian_notification_queue_unsent
  ON public.guardian_notification_queue (debounce_until, sent_at)
  WHERE sent_at IS NULL;

-- ─── TRIGGER 1: COURSE COMPLETION ─────────────────────────────────────────────
-- Fires AFTER UPDATE OF status ON course_enrollments.
-- course_enrollments.user_id references profiles(uid) — confirmed in
-- 20240601000005_user_maintenance_suite.sql (line 222-223).
-- guardian_links.student_uid also references profiles(uid), so we can compare
-- directly without a join through profiles.
--
-- SECURITY DEFINER is required so the trigger body can INSERT into the queue
-- table even though RLS on guardian_notification_queue blocks all authenticated
-- users. The trigger runs as the table owner (postgres / service role).

CREATE OR REPLACE FUNCTION public.queue_guardian_notification_on_completion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO public.guardian_notification_queue (student_uid, event_type, payload)
    SELECT
      NEW.user_id,
      'course_completed',
      jsonb_build_object('course_id', NEW.course_id, 'org_id', NEW.org_id)
    WHERE EXISTS (
      SELECT 1 FROM public.guardian_links WHERE student_uid = NEW.user_id
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guardian_notification_course_completion
  AFTER UPDATE OF status ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.queue_guardian_notification_on_completion();

-- ─── TRIGGER 2: BADGE AWARD ───────────────────────────────────────────────────
-- Fires AFTER INSERT ON profile_badges.
-- profile_badges.profile_id references profiles(uid) — confirmed in
-- 20240601000001_initial_schema.sql + 20240601000005_user_maintenance_suite.sql.
-- badges.title is the badge name — confirmed in 20240601000001_initial_schema.sql.
-- We JOIN badges to get the title so the payload is self-contained for the
-- Edge Function without needing an extra lookup per email send.

CREATE OR REPLACE FUNCTION public.queue_guardian_notification_on_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.guardian_notification_queue (student_uid, event_type, payload)
  SELECT
    NEW.profile_id,
    'badge_awarded',
    jsonb_build_object(
      'badge_name', b.title,
      'org_id',     NEW.org_id
    )
  FROM public.badges b
  WHERE b.id = NEW.badge_id
    AND EXISTS (
      SELECT 1 FROM public.guardian_links WHERE student_uid = NEW.profile_id
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guardian_notification_badge
  AFTER INSERT ON public.profile_badges
  FOR EACH ROW EXECUTE FUNCTION public.queue_guardian_notification_on_badge();
