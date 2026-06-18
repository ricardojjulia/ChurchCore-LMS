-- Migration 007: fix_admin_role
-- Originally promoted the project owner to admin via email + auth_id lookup.
-- Replaced with a no-op: first admin setup is documented in docs/github-setup.md.

SELECT 1;
