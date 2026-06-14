-- Diagnostic: verify profile_roles populated and helper functions reference the right table.
-- Safe to leave in place — just raises NOTICEs, no schema changes.

DO $$
DECLARE
  rec RECORD;
  fn_src text;
BEGIN
  -- 1. Count rows in profile_roles
  SELECT COUNT(*) INTO rec FROM public.profile_roles;
  RAISE NOTICE 'profile_roles row count: %', rec.count;

  -- 2. Show each row (should match profiles)
  FOR rec IN SELECT auth_id, uid, role::text, status::text FROM public.profile_roles LOOP
    RAISE NOTICE 'profile_roles row → auth_id=%, uid=%, role=%, status=%',
      rec.auth_id, rec.uid, rec.role, rec.status;
  END LOOP;

  -- 3. Confirm current_user_role() no longer references profiles table
  SELECT prosrc INTO fn_src
  FROM pg_proc
  WHERE proname = 'current_user_role'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF fn_src LIKE '%profile_roles%' AND fn_src NOT LIKE '%FROM public.profiles%' THEN
    RAISE NOTICE 'current_user_role() OK — reads profile_roles, not profiles';
  ELSE
    RAISE WARNING 'current_user_role() body may still reference profiles: %', fn_src;
  END IF;
END;
$$;
