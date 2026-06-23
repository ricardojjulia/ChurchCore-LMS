-- Leaderboard: ranked XP leaderboard scoped to caller's org
-- COUNCIL-2026-015
--
-- Schema facts confirmed before writing:
--   profiles.org_id EXISTS (via migration 20240601000005)
--   profiles.display_name EXISTS (renamed from full_name)
--   profile_roles has: uid, org_id, role (user_role enum), tenant_active
--   user_role ENUM values: 'admin','manager','teacher','student','guardian'
--
-- Uses profile_roles JOIN to filter by org AND tenant_active = true.
-- Guardian role excluded (guardians are not learners/staff).

CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(
  rank            BIGINT,
  uid             UUID,
  display_name    TEXT,
  xp_points       INTEGER,
  current_level   INTEGER,
  is_current_user BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      DENSE_RANK() OVER (ORDER BY COALESCE(p.xp_points, 0) DESC) AS rank,
      p.uid,
      COALESCE(p.display_name, 'Learner')               AS display_name,
      COALESCE(p.xp_points, 0)                          AS xp_points,
      COALESCE(p.current_level, 1)                      AS current_level,
      (p.uid = public.current_user_uid())               AS is_current_user
    FROM public.profiles p
    JOIN public.profile_roles pr ON pr.uid = p.uid
    WHERE pr.org_id         = public.current_user_org_id()
      AND pr.tenant_active  = true
      AND pr.role::text    != 'guardian'
  ),
  top_n AS (
    SELECT * FROM ranked ORDER BY rank ASC, xp_points DESC LIMIT p_limit
  ),
  current_user_row AS (
    SELECT * FROM ranked
    WHERE is_current_user = true
      AND uid NOT IN (SELECT uid FROM top_n)
  )
  SELECT * FROM top_n
  UNION ALL
  SELECT * FROM current_user_row
  ORDER BY rank ASC, xp_points DESC
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(INTEGER) TO authenticated;

-- Index: fast sort for leaderboard draw
CREATE INDEX IF NOT EXISTS idx_profiles_xp ON public.profiles(xp_points DESC);
