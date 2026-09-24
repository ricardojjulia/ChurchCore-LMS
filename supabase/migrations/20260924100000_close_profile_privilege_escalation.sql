-- ─── SECURITY: close self-service privilege escalation via profiles ──────────
-- Found by the COUNCIL-2026-031 test-suite build.
--
-- 1. "profiles: users update own" checks only uid = current_user_uid(), and
--    the table-level UPDATE grant covers every column. Any signed-in user
--    could PATCH their own profile to role = 'admin' and/or another org_id;
--    trg_sync_profile_roles copies both into profile_roles, which RLS trusts —
--    i.e. self-promotion to admin of ANY tenant through the public API.
--    Fix: users may update only their own personal columns (column-level
--    grant). Role, status, org, identity and XP change only via the service
--    role or SECURITY DEFINER functions.
--
-- 2. handle_new_user() took role and org_id from raw_user_meta_data, which a
--    person controls when calling auth.signUp() with the public key. With
--    sign-ups enabled, anyone could create themselves as an admin of any org.
--    Fix: role and org_id come only from raw_app_meta_data, which only the
--    service role can set. Every trusted creation path (join, invites, bulk
--    invite, tenant creation, demo reset) now sets app_metadata.

REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (
  display_name, avatar_url, date_of_birth, bio, specialty, website_url,
  timezone, notification_prefs, dashboard_layout, email_digest_enabled, updated_at
) ON public.profiles TO authenticated;

-- anon has no business writing profiles at all (RLS already denied it).
REVOKE INSERT, DELETE, TRUNCATE ON public.profiles FROM anon;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    auth_id,
    display_name,
    email,
    org_id,
    role,
    status
  ) VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.email,
    -- Tenant and role are authorization data: only the service role can set
    -- app_metadata. User-supplied metadata is used for the display name only.
    (NEW.raw_app_meta_data->>'org_id')::uuid,
    COALESCE(NEW.raw_app_meta_data->>'role', 'student')::public.user_role,
    'active'
  )
  ON CONFLICT (auth_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- GoTrue inserts the auth user first and applies custom app_metadata in a
-- follow-up UPDATE, so handle_new_user() (AFTER INSERT) never sees it for
-- admin.createUser({ app_metadata }) or later updateUserById calls. Keep the
-- profile's tenant and role in step with app_metadata whenever those keys
-- change. Only the service role can write app_metadata.
CREATE OR REPLACE FUNCTION public.sync_profile_from_app_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.raw_app_meta_data->>'org_id') IS DISTINCT FROM (OLD.raw_app_meta_data->>'org_id')
     OR (NEW.raw_app_meta_data->>'role') IS DISTINCT FROM (OLD.raw_app_meta_data->>'role') THEN
    UPDATE public.profiles p
    SET org_id     = COALESCE((NEW.raw_app_meta_data->>'org_id')::uuid, p.org_id),
        role       = COALESCE((NEW.raw_app_meta_data->>'role')::public.user_role, p.role),
        updated_at = now()
    WHERE p.auth_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_app_metadata_updated ON auth.users;
CREATE TRIGGER on_auth_user_app_metadata_updated
AFTER UPDATE OF raw_app_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_app_metadata();
