-- Migration 047: Enable Realtime publications for notifications and messages
-- RLS policies for both tables must be verified before enabling realtime
-- to prevent data leaks via the postgres_changes channel.

-- Enable pg_trgm extension (used by Phase R4 search indexes)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add tables to the supabase_realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;
