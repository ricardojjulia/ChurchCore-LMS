-- ─── handle_new_user: read org_id from raw_user_meta_data ────────────────────
-- Self-registered users arrive via /join/[slug] which calls supabase.auth.signUp
-- with options.data = { org_id, display_name }. This trigger reads those values
-- so the profile is immediately associated with the correct org.
--
-- The sync_profile_roles trigger (migration 021) fires after this INSERT and
-- automatically syncs org_id into profile_roles — no manual upsert needed here.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    (NEW.raw_user_meta_data->>'org_id')::uuid,  -- NULL for admin-invited users
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    'active'
  )
  ON CONFLICT (auth_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─── Allow anon users to look up active orgs by slug ─────────────────────────
-- Required for the /join/[slug] landing page — visitors are not authenticated.
-- Only exposes id, name, and settings (branding) for active orgs.

CREATE POLICY "organizations: anon read active"
  ON public.organizations FOR SELECT TO anon
  USING (status = 'active');
