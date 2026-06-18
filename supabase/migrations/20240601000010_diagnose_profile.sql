-- Migration 010: diagnose_profile
-- Development diagnostic that emitted NOTICE lines about a specific auth user.
-- Replaced with a no-op: made no schema changes, only queried auth.users.

SELECT 1;
