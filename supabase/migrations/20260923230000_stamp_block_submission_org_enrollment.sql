-- ─── block_submissions: stamp org_id and enrollment_id on insert ─────────────
-- Found by the COUNCIL-2026-031 learner flow.
--
-- submitAssignment(), submitQuiz() and markVideoWatched() insert into
-- block_submissions without org_id or enrollment_id (and DiscussionPlayer's
-- browser-side reply insert without user_id either) — both NOT NULL, and
-- org_id is what the "students submit" policy checks — so every learner
-- assignment submission, quiz submission and video completion failed with
-- "new row violates row-level security policy". (org_id was added by the
-- 2026-06 tenant-isolation migrations without updating these callers.)
--
-- Same pattern as stamp_course_block_org_id(): a SECURITY INVOKER BEFORE
-- INSERT trigger fills missing values from rows the caller can already read
-- under RLS — the block's org, and the learner's own active course
-- enrollment. RLS WITH CHECK is evaluated after BEFORE triggers, so the policy
-- still requires org_id = the caller's org; a learner with no enrollment gets
-- no enrollment_id and the NOT NULL constraint rejects the row.

CREATE OR REPLACE FUNCTION public.stamp_block_submission_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_course_id uuid;
  v_org_id    uuid;
BEGIN
  -- Identity comes from the session; the policy requires it to match anyway.
  IF NEW.user_id IS NULL THEN
    NEW.user_id := public.current_user_uid();
  END IF;

  SELECT cb.course_id, cb.org_id INTO v_course_id, v_org_id
  FROM public.course_blocks cb
  WHERE cb.id = NEW.block_id;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_org_id;
  END IF;

  IF NEW.enrollment_id IS NULL AND v_course_id IS NOT NULL THEN
    SELECT ce.id INTO NEW.enrollment_id
    FROM public.course_enrollments ce
    WHERE ce.course_id = v_course_id
      AND ce.user_id   = NEW.user_id
      AND ce.role      = 'student'
      AND ce.status    = 'active';  -- unique (course_id, user_id, role)
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_block_submission_context ON public.block_submissions;
CREATE TRIGGER trg_stamp_block_submission_context
BEFORE INSERT ON public.block_submissions
FOR EACH ROW EXECUTE FUNCTION public.stamp_block_submission_context();
