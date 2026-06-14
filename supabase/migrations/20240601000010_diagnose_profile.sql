-- Diagnostic: read auth.users + profiles for the project owner.
-- This migration makes NO changes; it only emits NOTICE lines.

DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== auth.users rows for ricardojjulia@gmail.com ===';
  FOR r IN SELECT id, email, created_at FROM auth.users WHERE email = 'ricardojjulia@gmail.com' LOOP
    RAISE NOTICE 'auth.users → id=% email=% created=%', r.id, r.email, r.created_at;
  END LOOP;

  RAISE NOTICE '=== profiles rows matching that email ===';
  FOR r IN
    SELECT p.uid, p.auth_id, p.email, p.role, p.status, p.display_name
    FROM public.profiles p
    JOIN auth.users au ON au.id = p.auth_id
    WHERE au.email = 'ricardojjulia@gmail.com'
  LOOP
    RAISE NOTICE 'profile → uid=% auth_id=% email=% role=% status=% name=%',
      r.uid, r.auth_id, r.email, r.role, r.status, r.display_name;
  END LOOP;

  RAISE NOTICE '=== ALL profiles (uid, role, status) ===';
  FOR r IN SELECT uid, auth_id, email, role, status FROM public.profiles ORDER BY uid LOOP
    RAISE NOTICE 'profile → uid=% auth_id=% email=% role=% status=%', r.uid, r.auth_id, r.email, r.role, r.status;
  END LOOP;
END $$;
