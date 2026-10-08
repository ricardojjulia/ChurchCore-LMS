-- COUNCIL-2026-040 Phase 1: Web Push Notifications
-- VAPID push subscriptions and delivery queue

-- 1. push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id, org_id);

-- 2. push_notification_queue
CREATE TABLE IF NOT EXISTS public.push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('announcement', 'grade_posted', 'new_message', 'course_completed', 'live_session_starting', 'streak_reminder', 'test_push')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  deep_link TEXT NOT NULL DEFAULT '/dashboard',
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'expired')) DEFAULT 'pending',
  attempt_count INT NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_queue_status_retry ON public.push_notification_queue(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_push_queue_user ON public.push_notification_queue(user_id, org_id);

-- 3. Add notification_prefs to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'notification_prefs'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN notification_prefs JSONB NOT NULL DEFAULT '{"announcement": true, "grade_posted": true, "new_message": true, "course_completed": true, "live_session_starting": true, "streak_reminder": false}'::jsonb;
  END IF;
END $$;

-- 4. RLS Policies
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (
    user_id = public.current_user_uid()
    OR public.is_org_admin()
    OR public.is_platform_admin()
  )
  WITH CHECK (
    user_id = public.current_user_uid()
    OR public.is_org_admin()
    OR public.is_platform_admin()
  );

CREATE POLICY "Users can view their own push notifications queue"
  ON public.push_notification_queue
  FOR SELECT
  USING (
    user_id = public.current_user_uid()
    OR public.is_org_admin()
    OR public.is_platform_admin()
  );

CREATE POLICY "Admins and managers can manage push queue"
  ON public.push_notification_queue
  FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_admin()
      OR public.is_org_manager()
      OR public.is_platform_admin()
    )
  );
