-- Definitive owner promotion via upsert.
-- Handles: profile exists (UPDATE), profile missing (INSERT), and
-- the race where handle_new_user fired after earlier migration UPDATEs.

DO $$
DECLARE
  v_auth_id uuid;
  v_uid     uuid;
BEGIN
  -- Get the auth identity for the project owner
  SELECT id INTO v_auth_id
  FROM auth.users
  WHERE email = 'ricardojjulia@gmail.com'
  LIMIT 1;

  IF v_auth_id IS NULL THEN
    RAISE NOTICE 'No auth user found for ricardojjulia@gmail.com — skipping.';
    RETURN;
  END IF;

  -- Does a profile row already exist?
  SELECT uid INTO v_uid
  FROM public.profiles
  WHERE auth_id = v_auth_id
  LIMIT 1;

  IF v_uid IS NOT NULL THEN
    -- Row exists: promote it
    UPDATE public.profiles
    SET role = 'admin', status = 'active'
    WHERE uid = v_uid;
    RAISE NOTICE 'Promoted existing profile % to admin.', v_uid;
  ELSE
    -- No profile yet: create one so the user can log in as admin immediately
    INSERT INTO public.profiles (auth_id, email, display_name, role, status)
    SELECT
      v_auth_id,
      au.email,
      COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1)),
      'admin',
      'active'
    FROM auth.users au
    WHERE au.id = v_auth_id;
    RAISE NOTICE 'Created admin profile for auth_id %.', v_auth_id;
  END IF;
END $$;
