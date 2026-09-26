-- ─── badges: org-scoped read, admin/manager management ───────────────────────
-- Found by the COUNCIL-2026-031 admin flow.
--
-- badges had a single policy — SELECT for any authenticated user, across every
-- tenant — and no INSERT/UPDATE/DELETE policy at all. /admin/badges writes with
-- the caller's session, so every create, edit and delete failed ("Failed to
-- create badge"), and each org could read every other org's badges.

DROP POLICY IF EXISTS "Badges are visible to all authenticated users" ON public.badges;

-- Platform-wide badges (org_id IS NULL) stay visible to everyone signed in.
CREATE POLICY "badges: read own org and global"
  ON public.badges FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR org_id IS NULL
    OR public.current_user_org_id() = org_id
  );

CREATE POLICY "badges: admins manage own org"
  ON public.badges FOR ALL TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin', 'manager')
    )
  );
