-- ─── platform_feedback: pilot/demo feedback and automatic error capture ────────
-- Platform-plane only — isolated exactly like platform_admins / platform_audit_log.
-- No tenant org_id column; rows are never mixed with tenant-scoped data.
-- The only write path for pilot submissions is the service-role route (/api/feedback).
-- Authenticated users (including regular org admins) have NO INSERT or DELETE access.

CREATE TABLE IF NOT EXISTS public.platform_feedback (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint               text        UNIQUE NOT NULL,
  session_id                uuid        NOT NULL,
  route                     text        NOT NULL,
  category                  text        NOT NULL CHECK (category IN ('BUG','ERROR','UNEXPECTED_RESULT','IMPROVEMENT')),
  error_message             text,
  note                      text,
  breadcrumbs               jsonb       NOT NULL DEFAULT '[]',
  user_email                text,
  user_role                 text,
  app_version               text,
  session_duration_seconds  integer     CHECK (session_duration_seconds IS NULL OR session_duration_seconds BETWEEN 0 AND 2592000),
  hit_count                 integer     NOT NULL DEFAULT 1,
  metadata                  jsonb       NOT NULL DEFAULT '{}',
  processed                 boolean     NOT NULL DEFAULT false,
  triage_action             text        CHECK (triage_action IN ('fixed','no_action_needed','acknowledged','implemented','received_closed')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_feedback_route      ON public.platform_feedback(route);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_category   ON public.platform_feedback(category);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_session    ON public.platform_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_created    ON public.platform_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_feedback_processed  ON public.platform_feedback(processed);

ALTER TABLE public.platform_feedback ENABLE ROW LEVEL SECURITY;

-- Platform admins can read all feedback rows
CREATE POLICY "platform_feedback: platform admins read"
  ON public.platform_feedback FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

-- Platform admins can update (triage) feedback rows
CREATE POLICY "platform_feedback: platform admins update"
  ON public.platform_feedback FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Service role has full access — used exclusively from the server-side submission route.
-- No INSERT policy for authenticated: pilot submissions only arrive via service_role.
CREATE POLICY "platform_feedback: service role"
  ON public.platform_feedback FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
