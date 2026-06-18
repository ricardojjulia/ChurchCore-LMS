-- Enable Realtime for report artifact status updates.
-- RLS select policies already restrict visible rows to the owning user or org admins.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'report_artifacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.report_artifacts;
  END IF;
END $$;
