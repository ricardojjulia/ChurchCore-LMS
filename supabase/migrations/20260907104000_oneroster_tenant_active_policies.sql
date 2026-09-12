-- Tighten OneRoster RLS to explicitly require active tenants.

CREATE OR REPLACE FUNCTION public.current_user_tenant_active()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT pr.tenant_active
    FROM public.profile_roles pr
    WHERE pr.auth_id = auth.uid()
    LIMIT 1
  ), FALSE);
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_tenant_active() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_user_tenant_active() TO authenticated;

DROP POLICY IF EXISTS "oneroster_connections: admins read own org" ON public.oneroster_connections;
DROP POLICY IF EXISTS "oneroster_connections: admins manage own org" ON public.oneroster_connections;

CREATE POLICY "oneroster_connections: admins read own active org"
  ON public.oneroster_connections FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_tenant_active()
      AND public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

CREATE POLICY "oneroster_connections: admins manage own active org"
  ON public.oneroster_connections FOR ALL TO authenticated
  USING (
    public.current_user_tenant_active()
    AND public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager')
  )
  WITH CHECK (
    public.current_user_tenant_active()
    AND public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager')
  );

DROP POLICY IF EXISTS "external_entity_links: staff read own org" ON public.external_entity_links;

CREATE POLICY "external_entity_links: staff read own active org"
  ON public.external_entity_links FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_tenant_active()
      AND public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager','teacher')
    )
  );

DROP POLICY IF EXISTS "oneroster_import_jobs: admins read own org" ON public.oneroster_import_jobs;

CREATE POLICY "oneroster_import_jobs: admins read own active org"
  ON public.oneroster_import_jobs FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_tenant_active()
      AND public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );

DROP POLICY IF EXISTS "oneroster_import_rows: admins read own org" ON public.oneroster_import_rows;

CREATE POLICY "oneroster_import_rows: admins read own active org"
  ON public.oneroster_import_rows FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_tenant_active()
      AND public.current_user_org_id() = org_id
      AND public.current_user_role() IN ('admin','manager')
    )
  );
