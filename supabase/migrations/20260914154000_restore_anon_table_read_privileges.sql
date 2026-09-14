-- Let anonymous PostgREST reads reach row-level security. Fresh local projects
-- lacked the API grant present in the linked project, causing policy checks to
-- fail with table permission errors instead of returning no visible rows.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
