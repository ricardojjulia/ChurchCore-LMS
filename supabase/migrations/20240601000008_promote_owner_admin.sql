-- Migration 008: promote_owner_admin
-- Originally upserted an admin profile for the project owner by email.
-- Replaced with a no-op: first admin setup is documented in docs/github-setup.md.
-- New installers: sign up, then set role = 'admin' in Supabase Dashboard →
-- Table Editor → profile_roles for your row.

SELECT 1;
