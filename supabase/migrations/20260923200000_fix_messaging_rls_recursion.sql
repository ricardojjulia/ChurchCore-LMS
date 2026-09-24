-- ─── Messaging RLS: remove self-referencing policies; require membership to post ─
-- Found by the COUNCIL-2026-031 page sweep.
--
-- 1. Two SELECT policies on message_thread_participants query
--    message_thread_participants itself ("read own org", "shared thread
--    select"). Postgres raises 42P17 "infinite recursion detected in policy"
--    for every read of the table — and message_threads / messages policies read
--    it too — so no thread could ever be opened. Production has 0 threads and
--    0 messages, consistent with messaging never having worked.
--
--    Fix: the same pattern as current_user_org_id() — a SECURITY DEFINER helper
--    that returns only the caller's own active thread ids (scoped by
--    current_user_uid(), so it grants nothing beyond the caller's own rows).
--    Tenant isolation stays in each policy's org_id check.
--
-- 2. "messages: participants send own org" checked org and sender_id but not
--    thread membership, so any org member who knew a thread id could post into
--    another user's private thread. INSERT now requires active membership.

CREATE OR REPLACE FUNCTION public.current_user_thread_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT thread_id
  FROM public.message_thread_participants
  WHERE user_id = public.current_user_uid()
    AND org_id = public.current_user_org_id()
    AND left_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_thread_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_user_thread_ids() TO authenticated;

-- ─── message_thread_participants ─────────────────────────────────────────────

DROP POLICY IF EXISTS "message_thread_participants: read own org" ON public.message_thread_participants;
DROP POLICY IF EXISTS "participants: shared thread select" ON public.message_thread_participants;

-- Co-participants of the caller's threads (the caller's own row is also
-- covered by the existing "participants: self select").
CREATE POLICY "message_thread_participants: read own threads"
  ON public.message_thread_participants FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND thread_id IN (SELECT public.current_user_thread_ids())
    )
  );

-- ─── message_threads ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "message_threads: participants read own org" ON public.message_threads;
DROP POLICY IF EXISTS "threads: participant select" ON public.message_threads;

CREATE POLICY "message_threads: participants read own threads"
  ON public.message_threads FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND id IN (SELECT public.current_user_thread_ids())
    )
  );

-- ─── messages ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "messages: participants read own org" ON public.messages;
DROP POLICY IF EXISTS "messages: participants send own org" ON public.messages;

CREATE POLICY "messages: participants read own threads"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND thread_id IN (SELECT public.current_user_thread_ids())
    )
  );

CREATE POLICY "messages: participants send to own threads"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND sender_id = public.current_user_uid()
    AND thread_id IN (SELECT public.current_user_thread_ids())
  );
