-- ─── upsert_platform_feedback(): atomic dedupe-or-reopen for the feedback route ──
-- The route previously did SELECT-by-fingerprint then branch to INSERT/UPDATE.
-- Two concurrent submissions with the same fingerprint could both observe no
-- existing row and both attempt INSERT; the loser hit the UNIQUE constraint on
-- `fingerprint` and its report was lost. This function performs the same
-- dedupe-or-reopen logic as a single atomic `INSERT ... ON CONFLICT DO UPDATE`,
-- which Postgres guarantees is race-free under concurrent callers.
--
-- SECURITY INVOKER (default) — this function grants no privilege beyond what
-- the calling role already has. It is callable only by service_role (see GRANT
-- below), which already has unrestricted access to platform_feedback via the
-- "platform_feedback: service role" policy in 20260918100000_platform_feedback.sql.
CREATE OR REPLACE FUNCTION public.upsert_platform_feedback(
  p_fingerprint               text,
  p_session_id                uuid,
  p_route                     text,
  p_category                  text,
  p_error_message             text,
  p_note                      text,
  p_breadcrumbs                jsonb,
  p_user_email                text,
  p_user_role                  text,
  p_app_version                 text,
  p_session_duration_seconds   integer
)
RETURNS TABLE (id uuid, hit_count integer)
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.platform_feedback (
    fingerprint, session_id, route, category, error_message, note,
    breadcrumbs, user_email, user_role, app_version, session_duration_seconds
  ) VALUES (
    p_fingerprint, p_session_id, p_route, p_category, p_error_message, p_note,
    p_breadcrumbs, p_user_email, p_user_role, p_app_version, p_session_duration_seconds
  )
  ON CONFLICT (fingerprint) DO UPDATE SET
    hit_count                = public.platform_feedback.hit_count + 1,
    breadcrumbs               = EXCLUDED.breadcrumbs,
    session_id                = EXCLUDED.session_id,
    user_email                = EXCLUDED.user_email,
    user_role                 = EXCLUDED.user_role,
    app_version                = EXCLUDED.app_version,
    session_duration_seconds  = EXCLUDED.session_duration_seconds,
    processed                 = false,
    triage_action              = NULL,
    updated_at                 = now()
  RETURNING public.platform_feedback.id, public.platform_feedback.hit_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_platform_feedback(
  text, uuid, text, text, text, text, jsonb, text, text, text, integer
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_platform_feedback(
  text, uuid, text, text, text, text, jsonb, text, text, text, integer
) TO service_role;
