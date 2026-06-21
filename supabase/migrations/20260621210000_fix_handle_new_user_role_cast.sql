-- ─── Fix handle_new_user: explicit ::user_role cast ──────────────────────────
-- JSONB ->> extraction yields text. Inside a SECURITY DEFINER trigger function,
-- PostgreSQL requires an explicit cast from text to the user_role enum — the
-- implicit assignment cast that works in ordinary DML is not applied here.
-- Without the cast, any call to supabase.auth.admin.createUser() (or signUp)
-- fails with "Database error creating new user" / "Database error saving new user".

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
    (NEW.raw_user_meta_data->>'org_id')::uuid,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')::public.user_role,
    'active'
  )
  ON CONFLICT (auth_id) DO NOTHING;

  RETURN NEW;
END;
$$;
