-- ─── Normalize organizations RLS to use current_user_org_id() helper ─────────
-- The original policies in 20260618200100_tenant_lifecycle.sql used an inline
-- subquery (id IN (SELECT org_id FROM profile_roles WHERE auth_id = auth.uid()))
-- instead of the project-standard current_user_org_id() helper. This is
-- functionally equivalent today but creates drift risk: if profile_roles schema
-- changes, the helper is the single place to update, not every policy.

DROP POLICY IF EXISTS "organizations: members read own"     ON public.organizations;
DROP POLICY IF EXISTS "organizations: org admin update own" ON public.organizations;

CREATE POLICY "organizations: members read own"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = id
    AND deleted_at IS NULL
  );

CREATE POLICY "organizations: org admin update own"
  ON public.organizations FOR UPDATE TO authenticated
  USING (
    public.current_user_org_id() = id
    AND public.current_user_role() = 'admin'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    public.current_user_org_id() = id
    AND public.current_user_role() = 'admin'
  );
