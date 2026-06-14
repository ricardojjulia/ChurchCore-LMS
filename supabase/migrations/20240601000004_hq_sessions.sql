-- Every AI response from the council is persisted here in full.
-- Supports per-agent history, full-text reference, and decision audit trail.

CREATE TABLE IF NOT EXISTS public.hq_sessions (
  id          uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid  REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id    text  NOT NULL,
  agent_name  text  NOT NULL,
  prompt      text  NOT NULL,
  response    text  NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hq_sessions_user_agent
  ON public.hq_sessions(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_hq_sessions_created
  ON public.hq_sessions(created_at DESC);

ALTER TABLE public.hq_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage their own hq sessions"
ON public.hq_sessions FOR ALL
USING  (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "admins can view all hq sessions"
ON public.hq_sessions FOR SELECT
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
