-- Migration: drop FK constraints from report_audit_log
--
-- report_audit_log has a PostgreSQL RULE that causes PostgREST's referential
-- integrity introspection to fail on ANY parent table it references
-- (courses, organizations, profiles). This blocks demo resets and any bulk
-- DELETE via the JS client.
--
-- Audit logs are append-only records that must survive the deletion of the
-- records they describe. Enforced FKs on audit tables are an anti-pattern:
-- they prevent cleanup and provide no data integrity benefit (the log row
-- is still meaningful even after the course/user is gone).
--
-- We keep the columns and their values; we just stop enforcing referential
-- integrity at the DB layer. Application code already validates these IDs
-- before writing the log row.

ALTER TABLE public.report_audit_log
  DROP CONSTRAINT IF EXISTS report_audit_log_actor_id_fkey,
  DROP CONSTRAINT IF EXISTS report_audit_log_org_id_fkey,
  DROP CONSTRAINT IF EXISTS report_audit_log_target_course_id_fkey,
  DROP CONSTRAINT IF EXISTS report_audit_log_target_user_id_fkey;
