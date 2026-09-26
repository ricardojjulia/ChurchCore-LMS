-- COUNCIL-2026-034 — self-serve organization signup and trial.

-- Where a tenant came from (platform console or public signup).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS signup_source text NOT NULL DEFAULT 'admin';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_signup_source_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_signup_source_check CHECK (signup_source IN ('admin', 'self_serve'));
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS organizations_trial_expiry_idx ON public.organizations (status, trial_ends_at);

-- Signups waiting for email verification. Only a SHA-256 hash of the token is
-- stored. Service role only: RLS is on with no policies, and the API roles
-- have no table privileges.
CREATE TABLE IF NOT EXISTS public.pending_signups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text        NOT NULL UNIQUE,
  email       text        NOT NULL,
  slug        text        NOT NULL,
  payload     jsonb       NOT NULL,
  expires_at  timestamptz NOT NULL,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_signups_slug_idx ON public.pending_signups (lower(slug)) WHERE verified_at IS NULL;
ALTER TABLE public.pending_signups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_signups FROM PUBLIC, anon, authenticated;

-- Amendment 7: organization status is the single source of member access.
-- Every status change (platform console, Stripe webhook, trial expiry) now
-- re-syncs profile_roles.tenant_active; the webhook used to leave it stale.
CREATE OR REPLACE FUNCTION public.sync_tenant_active_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.profile_roles
       SET tenant_active = NEW.status NOT IN ('suspended', 'deleted')
     WHERE org_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_tenant_active_on_status_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sync_tenant_active_on_status_change ON public.organizations;
CREATE TRIGGER trg_sync_tenant_active_on_status_change
  AFTER UPDATE OF status ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.sync_tenant_active_on_status_change();
