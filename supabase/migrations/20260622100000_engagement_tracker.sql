-- Migration 20260622100000: Engagement Tracker + Ledger (COUNCIL-2026-006)
-- Immutable event log for all learner engagement (ADR-2026-004)
-- Creates: engagement_events, engagement_streaks, record_engagement_event()

-- ── engagement_events ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.engagement_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  org_id      UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL CHECK (event_type IN (
                            'block_completion','quiz_pass','discussion_post',
                            'daily_login','course_completion','manual'
                          )),
  source_type TEXT        CHECK (source_type IN ('block','quiz','discussion','session','course')),
  source_id   UUID,       -- nullable: daily_login and manual have no source
  xp_earned   INTEGER     NOT NULL DEFAULT 0,
  metadata    JSONB       NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.engagement_events ENABLE ROW LEVEL SECURITY;

-- Deduplication: one event of a given type per user per source object
CREATE UNIQUE INDEX IF NOT EXISTS idx_engagement_events_dedup
  ON public.engagement_events(user_id, source_type, source_id, event_type)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_engagement_events_user_time
  ON public.engagement_events(user_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_engagement_events_org_time
  ON public.engagement_events(org_id, recorded_at DESC);

-- RLS: read own; staff reads all in org; no app-layer INSERT/UPDATE/DELETE
CREATE POLICY "engagement_events: user reads own"
  ON public.engagement_events FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = public.current_user_uid()
    OR (public.current_user_org_id() = org_id
        AND public.current_user_role() IN ('admin','manager','teacher'))
  );

-- No INSERT/UPDATE/DELETE policies — all writes go through record_engagement_event() SECURITY DEFINER

-- ── engagement_streaks ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.engagement_streaks (
  user_id        UUID    NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  org_id         UUID    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_event_date DATE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, org_id)
);

ALTER TABLE public.engagement_streaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_streaks: user reads own"
  ON public.engagement_streaks FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR user_id = public.current_user_uid()
    OR (public.current_user_org_id() = org_id
        AND public.current_user_role() IN ('admin','manager','teacher'))
  );

-- No INSERT/UPDATE policies — all writes go through record_engagement_event() SECURITY DEFINER

-- ── record_engagement_event() ─────────────────────────────────────────────────
-- Single entrypoint for all engagement tracking.
-- Inserts the event (idempotent via UNIQUE index), awards XP, updates streak.
-- Returns JSON: { inserted, xp_earned, new_xp, new_level, leveled_up, current_streak }

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
  -- ROW_COUNT > 0 means the row was inserted (not a duplicate)
  v_inserted := (v_inserted > 0);

  -- Award XP only on first insert (not on duplicate)
  IF v_inserted AND p_xp > 0 THEN
    SELECT public.award_xp(v_uid, p_xp) INTO v_xp_result;
    v_new_xp    := COALESCE((v_xp_result->>'new_xp')::INTEGER, 0);
    v_new_level := COALESCE((v_xp_result->>'new_level')::INTEGER, 1);
    v_leveled_up := COALESCE((v_xp_result->>'leveled_up')::BOOLEAN, FALSE);
  ELSE
    -- Return current XP even if no award
    SELECT COALESCE(xp_points, 0), COALESCE(current_level, 1)
      INTO v_new_xp, v_new_level
      FROM public.profiles
     WHERE uid = v_uid;
  END IF;

  -- Update streak (always, even on duplicate events — to record daily activity)
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

  -- Fallback if INSERT did not RETURNING (should not happen)
  IF v_new_streak IS NULL THEN
    SELECT current_streak, longest_streak
      INTO v_new_streak, v_longest
      FROM public.engagement_streaks
     WHERE user_id = v_uid AND org_id = v_org_id;
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
