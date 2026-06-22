-- Migration 20260622140000: Badge Auto-Triggers (COUNCIL-2026-012)
-- Depends on: 20260622100000_engagement_tracker.sql (engagement_streaks table)
-- Adds trigger_condition + is_auto_awarded to badges; evaluate_badge_triggers(); hooks into record_engagement_event()

-- ── 1. Extend badges table ─────────────────────────────────────────────────────

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS org_id            UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS trigger_condition JSONB,
  ADD COLUMN IF NOT EXISTS is_auto_awarded   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_badges_org ON public.badges(org_id);

-- ── 2. Extend notifications to include badge_earned type ──────────────────────
-- The existing CHECK constraint only allows specific types; we add badge_earned.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'message_received','announcement','assignment_graded',
    'assignment_due_soon','course_enrollment',
    'certificate_earned','grade_posted','system','badge_earned'
  ));

-- ── 3. evaluate_badge_triggers() ──────────────────────────────────────────────
-- Called from record_engagement_event() after event insert.
-- Evaluates all auto-award badges for the org, awards any newly met conditions.

CREATE OR REPLACE FUNCTION public.evaluate_badge_triggers(
  p_uid        UUID,
  p_org_id     UUID,
  p_event_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_badge  RECORD;
  v_meets  BOOLEAN;
  v_ctype  TEXT;
BEGIN
  FOR v_badge IN
    SELECT b.id, b.title, b.trigger_condition
      FROM public.badges b
     WHERE b.org_id = p_org_id
       AND b.is_auto_awarded = TRUE
       AND b.trigger_condition IS NOT NULL
       -- Skip badges already awarded to this user
       AND NOT EXISTS (
         SELECT 1 FROM public.profile_badges pb
          WHERE pb.badge_id = b.id
            AND pb.profile_id = p_uid
       )
  LOOP
    v_ctype := v_badge.trigger_condition->>'type';

    -- Only evaluate conditions that could be affected by this event type
    IF NOT (
      (v_ctype = 'xp_threshold')
      OR (v_ctype = 'course_completion' AND p_event_type = 'course_completion')
      OR (v_ctype = 'streak')
      OR (v_ctype = 'block_count'      AND p_event_type = 'block_completion')
    ) THEN
      CONTINUE;
    END IF;

    v_meets := CASE v_ctype
      WHEN 'xp_threshold' THEN
        (SELECT COALESCE(xp_points, 0) FROM public.profiles WHERE uid = p_uid)
          >= (v_badge.trigger_condition->>'threshold')::INTEGER

      WHEN 'course_completion' THEN
        (SELECT COUNT(*) FROM public.course_certificates WHERE user_id = p_uid)
          >= (v_badge.trigger_condition->>'count')::INTEGER

      WHEN 'streak' THEN
        (SELECT COALESCE(current_streak, 0)
           FROM public.engagement_streaks
          WHERE user_id = p_uid AND org_id = p_org_id)
          >= (v_badge.trigger_condition->>'days')::INTEGER

      WHEN 'block_count' THEN
        (SELECT COUNT(*)
           FROM public.engagement_events
          WHERE user_id = p_uid AND event_type = 'block_completion')
          >= (v_badge.trigger_condition->>'count')::INTEGER

      ELSE FALSE
    END;

    IF v_meets THEN
      INSERT INTO public.profile_badges (profile_id, badge_id, org_id, awarded_at)
      VALUES (p_uid, v_badge.id, p_org_id, NOW())
      ON CONFLICT DO NOTHING;

      -- Insert in-app notification (only if INSERT succeeded — i.e., not a dup)
      IF FOUND THEN
        INSERT INTO public.notifications (user_id, type, title, body, link)
        VALUES (
          p_uid,
          'badge_earned',
          '🏅 Badge Earned!',
          'You earned the "' || v_badge.title || '" badge.',
          '/profile#badges'
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.evaluate_badge_triggers(UUID, UUID, TEXT) TO authenticated;

-- ── 4. Wire evaluate_badge_triggers into record_engagement_event() ─────────────
-- We recreate the function with the new PERFORM call appended before RETURN.

CREATE OR REPLACE FUNCTION public.record_engagement_event(
  p_event_type  TEXT,
  p_source_type TEXT    DEFAULT NULL,
  p_source_id   UUID    DEFAULT NULL,
  p_xp          INTEGER DEFAULT 0,
  p_metadata    JSONB   DEFAULT '{}'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid           UUID;
  v_org_id        UUID;
  v_inserted      BOOLEAN := FALSE;
  v_new_streak    INTEGER := 0;
  v_longest       INTEGER := 0;
  v_xp_result     JSON;
  v_new_xp        INTEGER := 0;
  v_new_level     INTEGER := 1;
  v_leveled_up    BOOLEAN := FALSE;
BEGIN
  -- Resolve caller identity from profile_roles (hot-path table)
  SELECT uid, org_id
    INTO v_uid, v_org_id
    FROM public.profile_roles
   WHERE auth_id = auth.uid()
   LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN json_build_object('error', 'Profile not found');
  END IF;

  -- Validate event type
  IF p_event_type NOT IN ('block_completion','quiz_pass','discussion_post','daily_login','course_completion','manual') THEN
    RETURN json_build_object('error', 'Invalid event type');
  END IF;

  -- Insert event — ON CONFLICT DO NOTHING enforces deduplication
  INSERT INTO public.engagement_events
    (user_id, org_id, event_type, source_type, source_id, xp_earned, metadata)
  VALUES
    (v_uid, v_org_id, p_event_type, p_source_type, p_source_id,
     COALESCE(p_xp, 0), COALESCE(p_metadata, '{}'))
  ON CONFLICT (user_id, source_type, source_id, event_type)
    WHERE source_id IS NOT NULL
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  v_inserted := (v_inserted > 0);

  -- Award XP only on first insert (not on duplicate)
  IF v_inserted AND p_xp > 0 THEN
    SELECT public.award_xp(v_uid, p_xp) INTO v_xp_result;
    v_new_xp    := COALESCE((v_xp_result->>'new_xp')::INTEGER, 0);
    v_new_level := COALESCE((v_xp_result->>'new_level')::INTEGER, 1);
    v_leveled_up := COALESCE((v_xp_result->>'leveled_up')::BOOLEAN, FALSE);
  ELSE
    SELECT COALESCE(xp_points, 0), COALESCE(current_level, 1)
      INTO v_new_xp, v_new_level
      FROM public.profiles
     WHERE uid = v_uid;
  END IF;

  -- Update streak
  INSERT INTO public.engagement_streaks (user_id, org_id, current_streak, longest_streak, last_event_date)
  VALUES (v_uid, v_org_id, 1, 1, CURRENT_DATE)
  ON CONFLICT (user_id, org_id) DO UPDATE SET
    current_streak  = CASE
      WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
      WHEN engagement_streaks.last_event_date = CURRENT_DATE     THEN engagement_streaks.current_streak
      ELSE 1
    END,
    longest_streak  = GREATEST(
      engagement_streaks.longest_streak,
      CASE
        WHEN engagement_streaks.last_event_date = CURRENT_DATE - 1 THEN engagement_streaks.current_streak + 1
        WHEN engagement_streaks.last_event_date = CURRENT_DATE     THEN engagement_streaks.current_streak
        ELSE 1
      END
    ),
    last_event_date = CURRENT_DATE,
    updated_at      = NOW()
  RETURNING current_streak, longest_streak
    INTO v_new_streak, v_longest;

  IF v_new_streak IS NULL THEN
    SELECT current_streak, longest_streak
      INTO v_new_streak, v_longest
      FROM public.engagement_streaks
     WHERE user_id = v_uid AND org_id = v_org_id;
  END IF;

  -- Evaluate badge triggers after streak is up to date
  IF v_org_id IS NOT NULL THEN
    PERFORM public.evaluate_badge_triggers(v_uid, v_org_id, p_event_type);
  END IF;

  RETURN json_build_object(
    'inserted',        v_inserted,
    'xp_earned',       CASE WHEN v_inserted THEN COALESCE(p_xp, 0) ELSE 0 END,
    'new_xp',          v_new_xp,
    'new_level',       v_new_level,
    'leveled_up',      v_leveled_up,
    'current_streak',  COALESCE(v_new_streak, 0),
    'longest_streak',  COALESCE(v_longest, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_engagement_event(TEXT, TEXT, UUID, INTEGER, JSONB) TO authenticated;
