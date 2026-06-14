-- Check function owners and whether they can bypass RLS on profile_roles.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT p.proname,
           r.rolname AS owner,
           r.rolsuper AS is_superuser,
           r.rolinherit
    FROM pg_proc p
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE p.proname IN ('current_user_role', 'current_user_uid', 'current_user_status', 'sync_profile_roles')
      AND p.pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    RAISE NOTICE 'FUNCTION % → owner=%, is_superuser=%',
      rec.proname, rec.owner, rec.is_superuser;
  END LOOP;

  -- Also check: what role does the migration/session run as?
  RAISE NOTICE 'Current session role: %, is_superuser: %',
    current_user,
    (SELECT rolsuper FROM pg_roles WHERE rolname = current_user);

  -- Test: can the anon/authenticated role read profile_roles?
  RAISE NOTICE 'profile_roles has RLS: %',
    (SELECT relrowsecurity FROM pg_class WHERE relname = 'profile_roles' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public'));
END;
$$;
