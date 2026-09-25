-- COUNCIL-2026-033 follow-up — enable pg_net for scheduled Edge Function calls.
--
-- The guardian-notify cron job (every 5 minutes) calls net.http_post(), but the
-- pg_net extension was never enabled in production, so every run since
-- 2026-06-21 failed with `schema "net" does not exist` and no guardian
-- notification email was ever sent. The weekly-digest schedule needs it too.
-- pg_net always installs its functions into the `net` schema.
CREATE EXTENSION IF NOT EXISTS pg_net;
