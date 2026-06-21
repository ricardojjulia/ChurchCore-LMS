-- ─── organizations: add lifecycle columns ────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS status        text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial','active','suspended','deleted')),
  ADD COLUMN IF NOT EXISTS plan          text        NOT NULL DEFAULT 'free'
    CHECK (plan IN ('free','standard','premium')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at    timestamptz;

-- Ensure settings has branding/features/onboarding keys for existing orgs
UPDATE public.organizations
SET settings = settings
  || '{"branding":{},"features":{"ai_tutor":true,"guardian_portal":true,"leaderboard":true,"hq":true,"reporting":true},"onboarding":{"logo_uploaded":false,"first_teacher_invited":false,"first_course_created":false,"first_announcement_published":false}}'::jsonb
WHERE NOT (settings ? 'features');

-- ─── profile_roles: add tenant_active for suspended-tenant RLS ───────────────
ALTER TABLE public.profile_roles
  ADD COLUMN IF NOT EXISTS tenant_active boolean NOT NULL DEFAULT true;

-- ─── sync_profile_roles: extend to also sync tenant_active ───────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_roles()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant_active boolean := true;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.org_id IS NOT NULL THEN
    SELECT (status NOT IN ('suspended', 'deleted'))
      INTO v_tenant_active
      FROM public.organizations
      WHERE id = NEW.org_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.profile_roles
      (auth_id, uid, role, status, current_level, org_id, tenant_active)
    VALUES
      (NEW.auth_id, NEW.uid, NEW.role, NEW.status,
       COALESCE(NEW.current_level, 1), NEW.org_id, COALESCE(v_tenant_active, true))
    ON CONFLICT (auth_id) DO UPDATE
      SET uid           = EXCLUDED.uid,
          role          = EXCLUDED.role,
          status        = EXCLUDED.status,
          current_level = EXCLUDED.current_level,
          org_id        = EXCLUDED.org_id,
          tenant_active = EXCLUDED.tenant_active;

  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.profile_roles
    SET uid           = NEW.uid,
        role          = NEW.role,
        status        = NEW.status,
        current_level = COALESCE(NEW.current_level, 1),
        org_id        = NEW.org_id,
        tenant_active = COALESCE(v_tenant_active, true)
    WHERE auth_id = NEW.auth_id;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.profile_roles WHERE auth_id = OLD.auth_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── sync_org_status_to_profiles: called by platform actions ─────────────────
-- When an org is suspended/restored, call this to update all its users' tenant_active.
CREATE OR REPLACE FUNCTION public.sync_org_status_to_profiles(p_org_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active boolean;
BEGIN
  SELECT (status NOT IN ('suspended', 'deleted'))
    INTO v_active
    FROM public.organizations
    WHERE id = p_org_id;

  UPDATE public.profile_roles
    SET tenant_active = COALESCE(v_active, true)
    WHERE org_id = p_org_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.sync_org_status_to_profiles(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_org_status_to_profiles(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_org_status_to_profiles(uuid) TO authenticated;

-- Backfill existing profile_roles with tenant_active based on current org status
UPDATE public.profile_roles pr
SET tenant_active = (
  SELECT (o.status NOT IN ('suspended', 'deleted'))
  FROM public.organizations o
  WHERE o.id = pr.org_id
)
WHERE pr.org_id IS NOT NULL;

-- ─── Rewrite organizations RLS to include platform admin bypass ───────────────
DROP POLICY IF EXISTS "organizations: admin manage"           ON public.organizations;
DROP POLICY IF EXISTS "organizations: members read own org"   ON public.organizations;
DROP POLICY IF EXISTS "organizations: org admin update own"   ON public.organizations;
DROP POLICY IF EXISTS "organizations: platform admin full access" ON public.organizations;

CREATE POLICY "organizations: platform admin full access"
  ON public.organizations FOR ALL
  TO authenticated
  USING  (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "organizations: members read own"
  ON public.organizations FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND deleted_at IS NULL
  );

CREATE POLICY "organizations: org admin update own"
  ON public.organizations FOR UPDATE
  TO authenticated
  USING (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND public.current_user_role() = 'admin'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    id IN (SELECT org_id FROM public.profile_roles WHERE auth_id = auth.uid())
    AND public.current_user_role() = 'admin'
  );
