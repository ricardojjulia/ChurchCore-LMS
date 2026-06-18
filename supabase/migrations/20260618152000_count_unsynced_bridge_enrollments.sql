-- Creates the RPC called by the system-health-check Edge Function to detect
-- active direct_enrollments whose users have no corresponding course enrollment.
-- The bridge (migration 040) links: direct_enrollments → course_sections.blueprint_id
-- → courses.blueprint_id → enrollments.course_id. Returns 0 when the bridge is
-- fully in sync; >0 triggers a warning in the health panel.

CREATE OR REPLACE FUNCTION public.count_unsynced_bridge_enrollments()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM direct_enrollments de
  JOIN course_sections cs ON cs.id = de.section_id
  JOIN courses c ON c.blueprint_id = cs.blueprint_id
  WHERE c.blueprint_id IS NOT NULL
    AND de.status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM enrollments e
      WHERE e.user_id  = de.user_id
        AND e.course_id = c.id
    );
$$;

-- Only admins and service role can call this — it reads enrollment data across all users.
REVOKE ALL ON FUNCTION public.count_unsynced_bridge_enrollments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_unsynced_bridge_enrollments() TO service_role;
