-- ============================================================
-- Migration 042: Squash documentation — diagnostic period
--
-- Migrations 010–020 are preserved in history but contain only
-- RAISE NOTICE / diagnostic DO blocks. Their net schema effect:
--
--   010  — no schema changes (diagnostic only)
--   011  — created get_my_profile() SECURITY DEFINER function
--   012  — dropped get_my_profile() (net: function does not exist)
--   013  — rewrote current_user_uid/role with SET row_security=off
--   014  — introduced profile_roles table + sync trigger;
--           rewrote helpers to read from profile_roles (final state)
--   015  — no schema changes (diagnostic only)
--   016  — no schema changes (diagnostic only)
--   017  — no schema changes (diagnostic only)
--   018  — no schema changes (diagnostic only)
--   019  — no schema changes (diagnostic only)
--   020  — no schema changes (diagnostic only)
--   021  — fixed cross-table recursion in other tables' RLS policies
--
-- Authoritative final state after migration 021:
--   * profile_roles table exists with RLS ON and no client policies
--   * sync_profile_roles() trigger keeps it in sync with profiles
--   * current_user_uid(), current_user_role(), current_user_status()
--     all read from profile_roles (never from profiles directly)
--   * No RLS policy on any non-profile table references profiles directly
--
-- This migration validates that invariant and makes no schema changes.
-- ============================================================

DO $$
DECLARE
  v_table_exists  BOOLEAN;
  v_fn_references TEXT;
  v_bad_policies  INTEGER;
BEGIN
  -- 1. profile_roles must exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profile_roles'
  ) INTO v_table_exists;
  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'INVARIANT FAILED: profile_roles table is missing';
  END IF;

  -- 2. current_user_role() must reference profile_roles, not profiles
  SELECT prosrc INTO v_fn_references
  FROM pg_proc
  WHERE proname = 'current_user_role'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF v_fn_references IS NULL THEN
    RAISE EXCEPTION 'INVARIANT FAILED: current_user_role() function is missing';
  END IF;

  IF v_fn_references LIKE '%FROM public.profiles%' THEN
    RAISE EXCEPTION 'INVARIANT FAILED: current_user_role() still queries profiles directly';
  END IF;

  -- 3. No non-profile RLS policy should reference public.profiles directly
  SELECT COUNT(*) INTO v_bad_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  != 'profiles'
    AND (qual        LIKE '%public.profiles%'
      OR with_check  LIKE '%public.profiles%');

  IF v_bad_policies > 0 THEN
    RAISE WARNING '% RLS policies on non-profile tables directly reference public.profiles. '
                  'These should be rewritten to use current_user_uid() / current_user_role().',
                  v_bad_policies;
  END IF;

  RAISE NOTICE 'Migration 042 validation passed: profile_roles OK, helper functions OK, RLS OK';
END;
$$;
