-- COUNCIL-2026-035 — teacher ↔ guardian messaging, plus the thread self-join
-- fix (Amendment 5).

-- ── Amendment 5: no user-level thread/participant inserts ───────────────────
-- These policies were OR'd with org-only checks, so any org member could add
-- themselves to any thread (and then read it) or create a thread naming
-- someone else as creator. Every thread and participant row is written by a
-- server action with the service role, so users need no INSERT path at all.
DROP POLICY IF EXISTS "message_thread_participants: insert own org" ON public.message_thread_participants;
DROP POLICY IF EXISTS "participants: creator insert"                ON public.message_thread_participants;
DROP POLICY IF EXISTS "threads: authenticated insert"               ON public.message_threads;
DROP POLICY IF EXISTS "message_threads: participants insert"        ON public.message_threads;

-- ── Threads about one student ────────────────────────────────────────────────
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS subject_student_uid uuid REFERENCES public.profiles(uid) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS message_threads_subject_student_idx
  ON public.message_threads (subject_student_uid) WHERE subject_student_uid IS NOT NULL;

-- May the caller message p_other_uid about p_student_uid? Allowed pairs only:
--   a guardian linked to the student ↔ a teacher who owns a course the student
--   is enrolled in, or an admin/manager of the student's org (either direction).
-- SECURITY DEFINER so it can read links and enrollments across the policies
-- it backs; it enforces isolation (same org, real link, real enrollment), it
-- does not bypass it.
CREATE OR REPLACE FUNCTION public.can_message_about(p_student_uid uuid, p_other_uid uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := public.current_user_uid();
  v_org      uuid := public.current_user_org_id();
  v_guardian uuid;
  v_staff    uuid;
BEGIN
  IF v_me IS NULL OR v_org IS NULL OR p_other_uid = v_me THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE uid = p_student_uid AND org_id = v_org) THEN
    RETURN false;
  END IF;

  -- Work out which side is the guardian and which is the staff member.
  IF EXISTS (SELECT 1 FROM public.guardian_links WHERE guardian_uid = v_me AND student_uid = p_student_uid AND org_id = v_org) THEN
    v_guardian := v_me;  v_staff := p_other_uid;
  ELSIF EXISTS (SELECT 1 FROM public.guardian_links WHERE guardian_uid = p_other_uid AND student_uid = p_student_uid AND org_id = v_org) THEN
    v_guardian := p_other_uid;  v_staff := v_me;
  ELSE
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.profiles s
    WHERE s.uid = v_staff AND s.org_id = v_org
      AND (
        s.role IN ('admin', 'manager')
        OR (s.role = 'teacher' AND EXISTS (
          SELECT 1 FROM public.courses c
          JOIN public.enrollments e ON e.course_id = c.id
          WHERE c.owner_id = v_staff AND c.org_id = v_org
            AND e.user_id = p_student_uid AND e.transit_status <> 'dropped'
        ))
      )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.can_message_about(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_message_about(uuid, uuid) TO authenticated;

-- May the caller post to this thread? Ordinary threads: yes (membership is
-- checked by the messages policy). Threads about a student: only while the
-- guardian ↔ staff pair is still allowed, so they become read-only when the
-- guardian link is removed or the enrollment is dropped. A completed course
-- still counts: a guardian may ask about a course their child finished.
CREATE OR REPLACE FUNCTION public.can_post_to_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN t.subject_student_uid IS NULL THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.message_thread_participants p
      WHERE p.thread_id = t.id AND p.user_id <> public.current_user_uid() AND p.left_at IS NULL
        AND public.can_message_about(t.subject_student_uid, p.user_id)
    )
  END
  FROM public.message_threads t
  WHERE t.id = p_thread_id;
$$;
REVOKE EXECUTE ON FUNCTION public.can_post_to_thread(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.can_post_to_thread(uuid) TO authenticated;

DROP POLICY IF EXISTS "messages: participants send to own threads" ON public.messages;
CREATE POLICY "messages: participants send to own threads"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND sender_id = public.current_user_uid()
    AND thread_id IN (SELECT public.current_user_thread_ids())
    AND coalesce(public.can_post_to_thread(thread_id), false)
  );

-- ── Guardian email for new messages (no body; Amendment 4) ───────────────────
ALTER TABLE public.guardian_notification_queue DROP CONSTRAINT IF EXISTS guardian_notification_queue_event_type_check;
ALTER TABLE public.guardian_notification_queue
  ADD CONSTRAINT guardian_notification_queue_event_type_check
  CHECK (event_type IN ('course_completed', 'badge_awarded', 'assignment_graded', 'message_received'));
