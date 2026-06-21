-- ─── platform_admins: separate identity plane for super-admins ───────────────
-- This table is the ONLY source of truth for platform-level access.
-- is_platform_admin() reads this table — never profiles.role.
-- The first platform admin must be bootstrapped via the commented INSERT below.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id      uuid        UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- ─── is_platform_admin(): the single gate for platform-level access ───────────
-- Defined BEFORE policies that reference it.
-- SECURITY DEFINER: reads platform_admins directly, bypassing RLS on that table.
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE auth_id = auth.uid()
  )
$$;

REVOKE ALL    ON FUNCTION public.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;

-- ─── RLS policies (now safe — function exists above) ─────────────────────────
-- Only existing platform admins can read or write this table
CREATE POLICY "platform_admins: read"
  ON public.platform_admins FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_admins: insert"
  ON public.platform_admins FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

CREATE POLICY "platform_admins: delete"
  ON public.platform_admins FOR DELETE
  TO authenticated
  USING (public.is_platform_admin());

-- Service role can manage platform admins for bootstrapping
CREATE POLICY "platform_admins: service role"
  ON public.platform_admins FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ─── platform_audit_log: immutable record of all platform admin actions ───────
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid        REFERENCES auth.users(id) ON DELETE RESTRICT,
  action     text        NOT NULL,
  target_org uuid        REFERENCES public.organizations(id) ON DELETE SET NULL,
  payload    jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_actor   ON public.platform_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_org     ON public.platform_audit_log(target_org);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON public.platform_audit_log(created_at DESC);

ALTER TABLE public.platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_audit_log: platform admins read"
  ON public.platform_audit_log FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "platform_audit_log: service role insert"
  ON public.platform_audit_log FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ─── Bootstrap: uncomment and fill in to create your first platform admin ─────
-- Find your auth UID: SELECT id FROM auth.users WHERE email = 'your@email.com';
-- INSERT INTO public.platform_admins (auth_id, display_name)
-- VALUES ('<YOUR_AUTH_UID>', 'Platform Owner')
-- ON CONFLICT (auth_id) DO NOTHING;
