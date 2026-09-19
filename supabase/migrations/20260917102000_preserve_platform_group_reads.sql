-- COUNCIL-2026-021: preserve the existing platform read policies. Permissive
-- operation policies still require tenant roles or membership for mutations.
ALTER POLICY "section_groups: active tenant boundary" ON public.section_groups
USING (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()))
WITH CHECK (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()));

ALTER POLICY "section_group_members: active tenant boundary" ON public.section_group_members
USING (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()))
WITH CHECK (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()));

ALTER POLICY "group_threads: active tenant boundary" ON public.group_threads
USING (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()))
WITH CHECK (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()));

ALTER POLICY "group_posts: active tenant boundary" ON public.group_posts
USING (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()))
WITH CHECK (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()));
