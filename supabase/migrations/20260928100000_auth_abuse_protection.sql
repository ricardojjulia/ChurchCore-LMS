-- COUNCIL-2026-045 — auth throttling and security events.
-- Both tables are server-only: RLS is on, users get no write path, and keys
-- are SHA-256 hashes (never a raw email or IP).

-- ── Throttle counters ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_throttle (
  key          text        PRIMARY KEY,
  hits         integer     NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_throttle FROM PUBLIC, anon, authenticated;
-- No policies: only the service role (which bypasses RLS) touches it.

-- Count one hit against p_key in a fixed window. Returns whether the hit is
-- within the limit and, if not, how many seconds until the window resets.
-- Atomic: concurrent callers serialize on the row.
CREATE OR REPLACE FUNCTION public.auth_throttle_hit(p_key text, p_max integer, p_window_seconds integer)
RETURNS TABLE (allowed boolean, retry_after integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_hits  integer;
  v_start timestamptz;
BEGIN
  INSERT INTO public.auth_throttle AS t (key, hits, window_start)
  VALUES (p_key, 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits         = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE t.hits + 1 END,
        window_start = CASE WHEN t.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE t.window_start END
  RETURNING t.hits, t.window_start INTO v_hits, v_start;

  -- Occasional pruning keeps the table small without a scheduled job.
  IF random() < 0.01 THEN
    DELETE FROM public.auth_throttle WHERE window_start < now() - interval '1 day';
  END IF;

  allowed     := v_hits <= p_max;
  retry_after := CASE WHEN v_hits <= p_max THEN 0
                      ELSE greatest(1, ceil(extract(epoch FROM (v_start + make_interval(secs => p_window_seconds) - now())))::integer) END;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_throttle_clear(p_key text)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$ DELETE FROM public.auth_throttle WHERE key = p_key; $$;

REVOKE EXECUTE ON FUNCTION public.auth_throttle_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_throttle_clear(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.auth_throttle_hit(text, integer, integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.auth_throttle_clear(text) TO service_role;

-- ── Security events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_security_events (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  event       text        NOT NULL CHECK (event IN (
                'login_throttled', 'login_failed', 'captcha_failed',
                'join_throttled', 'reset_requested', 'reset_throttled', 'password_changed')),
  ip_hash     text,
  email_hash  text
);
CREATE INDEX IF NOT EXISTS auth_security_events_created_idx ON public.auth_security_events (created_at DESC);
ALTER TABLE public.auth_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_security_events FROM PUBLIC, anon;
GRANT SELECT ON public.auth_security_events TO authenticated;

DROP POLICY IF EXISTS "auth_security_events: platform admins read" ON public.auth_security_events;
CREATE POLICY "auth_security_events: platform admins read"
  ON public.auth_security_events FOR SELECT TO authenticated
  USING (public.is_platform_admin());
