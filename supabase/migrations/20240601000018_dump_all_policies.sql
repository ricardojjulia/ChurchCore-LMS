-- Dump every RLS policy on public.profiles.
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
    ORDER BY cmd, policyname
  LOOP
    RAISE NOTICE 'POLICY "%" CMD=% USING=% WITH_CHECK=%',
      rec.policyname, rec.cmd, rec.qual, rec.with_check;
  END LOOP;
END;
$$;
