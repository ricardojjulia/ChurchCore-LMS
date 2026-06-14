-- Diagnose current role state in both profiles and profile_roles.

DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '=== profiles table ===';
  FOR rec IN SELECT uid, auth_id, role::text, status::text, display_name FROM public.profiles LOOP
    RAISE NOTICE 'profiles → uid=%, auth_id=%, role=%, status=%, name=%',
      rec.uid, rec.auth_id, rec.role, rec.status, rec.display_name;
  END LOOP;

  RAISE NOTICE '=== profile_roles table ===';
  FOR rec IN SELECT auth_id, uid, role::text, status::text FROM public.profile_roles LOOP
    RAISE NOTICE 'profile_roles → auth_id=%, uid=%, role=%, status=%',
      rec.auth_id, rec.uid, rec.role, rec.status;
  END LOOP;

  RAISE NOTICE '=== triggers on profiles ===';
  FOR rec IN
    SELECT trigger_name, event_manipulation, action_timing
    FROM information_schema.triggers
    WHERE event_object_table = 'profiles'
      AND event_object_schema = 'public'
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE 'trigger → % % %', rec.action_timing, rec.event_manipulation, rec.trigger_name;
  END LOOP;
END;
$$;
