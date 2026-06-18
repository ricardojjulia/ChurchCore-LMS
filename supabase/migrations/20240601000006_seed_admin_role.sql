-- Migration 006: seed_admin_role
-- Originally promoted the project owner to admin by email.
-- Replaced with a no-op: the first admin is set up manually after installation.
-- See docs/github-setup.md → "First admin user" for setup instructions.

SELECT 1;
