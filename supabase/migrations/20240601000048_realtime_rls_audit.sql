-- Migration 048: Realtime RLS audit — verify both tables are secure before
-- realtime was enabled in migration 047.
--
-- notifications: RLS enabled in migration 023 with policy "notifications: user owns"
--   USING (user_id = current_user_uid())
--   WITH CHECK (user_id = current_user_uid())
--   This covers SELECT, INSERT, UPDATE, DELETE — realtime INSERT events are safe.
--
-- messages: RLS enabled in migration 024 with policies:
--   "messages: participant select" — thread participant check via current_user_uid()
--   "messages: participant insert" — sender_id = current_user_uid() check
--   "messages: self soft delete"   — sender only
--   Realtime INSERT events are scoped to thread participants.
--
-- No new policies are created here — existing policies satisfy the security
-- requirement. This migration exists to document the audit and provide a
-- rollback point if realtime is disabled.

-- Verify RLS is enabled (these are no-ops if already enabled)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- Security note: Supabase realtime postgres_changes respects RLS.
-- A user subscribed to `notifications` with filter `user_id=eq.{uid}`
-- will only receive events that pass their RLS SELECT policy.
-- Reference: https://supabase.com/docs/guides/realtime/postgres-changes#row-level-security
