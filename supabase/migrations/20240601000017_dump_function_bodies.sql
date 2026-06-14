-- Dump exact source of helper functions to verify what's in the DB.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT proname, prosrc, prosecdef, proconfig
    FROM pg_proc
    WHERE proname IN ('current_user_role', 'current_user_uid', 'current_user_status')
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  LOOP
    RAISE NOTICE 'FUNCTION % | security_definer=% | config=% | body: %',
      rec.proname, rec.prosecdef, rec.proconfig, rec.prosrc;
  END LOOP;
END;
$$;
