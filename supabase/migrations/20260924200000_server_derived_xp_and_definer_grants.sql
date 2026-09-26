-- COUNCIL-2026-033 — XP integrity and SECURITY DEFINER execute grants.
--
-- 1. record_engagement_event() trusted the caller's p_xp and never checked the
--    source, so any signed-in user could call it through PostgREST with any
--    XP amount and a fresh random source_id each time. XP is now derived here
--    from the real block / submission / enrollment, and the source must be one
--    the caller is enrolled in. p_xp stays in the signature (ignored) so
--    existing callers keep working.
--
-- 2. award_xp(p_uid, p_amount) was executable by anon and authenticated: for
--    anon, `current_user_role() NOT IN (...)` is NULL, so the guard never
--    raised — anyone could add unlimited XP to any profile, and staff could
--    add XP across tenants. It is now internal (service role + definer
--    callers only). So are evaluate_badge_triggers, the report view refresh
--    and the org-status sync.
--
-- 3. Every other SECURITY DEFINER function in public was executable by anon
--    through the default grants. anon keeps EXECUTE only on the helpers that
--    RLS policies call (policies are evaluated for anon too); signed-in users
--    keep what they had. supabase/tests/definer_grants_test.sql pins this.

-- ── 1. Server-derived XP ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_engagement_event(
  p_event_type  TEXT,
  p_source_type TEXT    DEFAULT NULL,
  p_source_id   UUID    DEFAULT NULL,
  p_xp          INTEGER DEFAULT 0,   -- ignored: XP is derived below
  p_metadata    JSONB   DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid           UUID;
  v_org_id        UUID;
  v_xp            INTEGER := 0;
  v_base          INTEGER;
  v_block_type    TEXT;
  v_course_id     UUID;
  v_score         NUMERIC;
  v_max           NUMERIC;
  v_row_count     INTEGER := 0;
  v_inserted      BOOLEAN := FALSE;
  v_new_streak    INTEGER := 0;
  v_longest       INTEGER := 0;
  v_xp_result     JSON;
  v_new_xp        INTEGER := 0;
  v_new_level     INTEGER := 1;
  v_leveled_up    BOOLEAN := FALSE;
BEGIN
  SELECT pr.uid, pr.org_id
    INTO v_uid, v_org_id
    FROM public.profile_roles pr
   WHERE pr.auth_id = auth.uid()
   LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Profile not found');
  END IF;

  IF p_event_type NOT IN ('block_completion','quiz_pass','discussion_post','daily_login','course_completion','manual') THEN
    RETURN json_build_object('error', 'Invalid event type');
  END IF;

  -- Validate the source and derive XP from it.
  IF p_event_type IN ('block_completion', 'quiz_pass') THEN
    SELECT cb.block_type_id, cb.course_id,
           NULLIF(COALESCE((cb.gamification->>'base_xp_reward')::int, 0), 0)
      INTO v_block_type, v_course_id, v_base
      FROM public.course_blocks cb
      JOIN public.enrollments e
        ON e.course_id = cb.course_id AND e.user_id = v_uid AND e.org_id = v_org_id
     WHERE cb.id = p_source_id
       AND cb.is_published;
    IF v_course_id IS NULL THEN
      RETURN json_build_object('error', 'Invalid source');
    END IF;

    IF p_event_type = 'block_completion' THEN
      IF p_source_type IS DISTINCT FROM 'block' THEN
        RETURN json_build_object('error', 'Invalid source');
      END IF;
      v_xp := COALESCE(v_base, 10);
    ELSE
      IF p_source_type IS DISTINCT FROM 'quiz' OR v_block_type <> 'quiz' THEN
        RETURN json_build_object('error', 'Invalid source');
      END IF;
      SELECT bs.score, bs.max_score INTO v_score, v_max
        FROM public.block_submissions bs
       WHERE bs.block_id = p_source_id AND bs.user_id = v_uid
       ORDER BY bs.submitted_at DESC NULLS LAST, bs.created_at DESC
       LIMIT 1;
      IF NOT FOUND THEN
        RETURN json_build_object('error', 'Invalid source');
      END IF;
      v_xp := CASE
        WHEN v_base IS NULL THEN 25
        ELSE GREATEST(
          round(v_base * COALESCE(v_score / NULLIF(v_max, 0), 0))::int,
          round(v_base * 0.5)::int)
      END;
    END IF;

  ELSIF p_event_type = 'course_completion' THEN
    IF p_source_type IS DISTINCT FROM 'course' OR NOT EXISTS (
      SELECT 1 FROM public.enrollments e
       WHERE e.course_id = p_source_id AND e.user_id = v_uid
         AND e.org_id = v_org_id AND e.transit_status = 'completed'
    ) THEN
      RETURN json_build_object('error', 'Invalid source');
    END IF;
    v_xp := 100;

  ELSE
    -- discussion_post / daily_login / manual: recorded for streaks, no XP
    -- from a caller-supplied source.
    v_xp := 0;
  END IF;

  v_xp := LEAST(v_xp, 1000);

  INSERT INTO public.engagement_events
    (user_id, org_id, event_type, source_type, source_id, xp_earned, metadata)
  VALUES
    (v_uid, v_org_id, p_event_type, p_source_type, p_source_id,
     v_xp, COALESCE(p_metadata, '{}'::JSONB))
  ON CONFLICT (user_id, source_type, source_id, event_type)
    WHERE source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_inserted := (v_row_count > 0);

  IF v_inserted AND v_xp > 0 THEN
    SELECT public.award_xp(v_uid, v_xp) INTO v_xp_result;
    v_new_xp := COALESCE((v_xp_result->>'new_xp')::INTEGER, 0);
    v_new_level := COALESCE((v_xp_result->>'new_level')::INTEGER, 1);
    v_leveled_up := COALESCE((v_xp_result->>'leveled_up')::BOOLEAN, FALSE);
  ELSE
    SELECT COALESCE(p.xp_points, 0), COALESCE(p.current_level, 1)
      INTO v_new_xp, v_new_level
      FROM public.profiles p
     WHERE p.uid = v_uid;
  END IF;

  INSERT INTO public.engagement_streaks (user_id, org_id, current_streak, longest_streak, last_event_date)
  VALUES (v_uid, v_org_id, 1, 1, CURRENT_DATE)
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    current_streak = CASE
      WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
      WHEN engagement_streaks.last_event_date = CURRENT_DATE THEN engagement_streaks.current_streak
      ELSE 1
    END,
    longest_streak = GREATEST(
      engagement_streaks.longest_streak,
      CASE
        WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
        WHEN engagement_streaks.last_event_date = CURRENT_DATE THEN engagement_streaks.current_streak
        ELSE 1
      END
    ),
    last_event_date = CURRENT_DATE,
    updated_at = NOW()
  RETURNING current_streak, longest_streak
    INTO v_new_streak, v_longest;

  IF v_new_streak IS NULL THEN
    SELECT es.current_streak, es.longest_streak
      INTO v_new_streak, v_longest
      FROM public.engagement_streaks es
     WHERE es.user_id = v_uid
       AND es.org_id = v_org_id;
  END IF;

  IF v_org_id IS NOT NULL THEN
    PERFORM public.evaluate_badge_triggers(v_uid, v_org_id, p_event_type);
  END IF;

  RETURN json_build_object(
    'inserted',        v_inserted,
    'xp_earned',       CASE WHEN v_inserted THEN v_xp ELSE 0 END,
    'new_xp',          v_new_xp,
    'new_level',       v_new_level,
    'leveled_up',      v_leveled_up,
    'current_streak',  COALESCE(v_new_streak, 0),
    'longest_streak',  COALESCE(v_longest, 0)
  );
END;
$$;

-- ── 2. Internal-only functions ───────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.award_xp(uuid, integer)                      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_badge_triggers(uuid, uuid, text)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_report_materialized_views()          FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_org_status_to_profiles(uuid)            FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_xp(uuid, integer)                      TO service_role;
GRANT  EXECUTE ON FUNCTION public.evaluate_badge_triggers(uuid, uuid, text)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.refresh_report_materialized_views()          TO service_role;
GRANT  EXECUTE ON FUNCTION public.sync_org_status_to_profiles(uuid)            TO service_role;

-- ── 3. No anon EXECUTE on SECURITY DEFINER functions, except RLS helpers ─────
DO $$
DECLARE
  f record;
  rls_helpers text[] := ARRAY[
    'check_section_access', 'current_user_level', 'current_user_org_id',
    'current_user_role', 'current_user_tenant_active', 'current_user_thread_ids',
    'current_user_uid', 'is_group_member', 'is_platform_admin'
  ];
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prokind = 'f'
  LOOP
    IF f.proname = ANY (rls_helpers) THEN
      CONTINUE;
    END IF;
    -- Keep signed-in access where it exists today (usually via PUBLIC), then
    -- drop PUBLIC and anon.
    IF has_function_privilege('authenticated', f.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f.sig);
  END LOOP;
END;
$$;

-- New functions created by the migration role default to no anon EXECUTE.
-- Scope: this covers functions created by the role that runs migrations only;
-- functions created by other roles (Supabase internals) are not covered.
-- supabase/tests/definer_grants_test.sql is the backstop for public schema.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
