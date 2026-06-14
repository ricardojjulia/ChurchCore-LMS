-- Dump ALL RLS policies across all public tables to find what references profiles.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename, cmd, policyname
  LOOP
    RAISE NOTICE 'TABLE=% POLICY="%" CMD=% USING=% WITH_CHECK=%',
      rec.tablename, rec.policyname, rec.cmd,
      COALESCE(rec.qual, '<null>'),
      COALESCE(rec.with_check, '<null>');
  END LOOP;
END;
$$;
