-- ─── Learner progress: compute and persist it server-side ────────────────────
-- Found by the COUNCIL-2026-031 learner flow.
--
-- markBlockViewed() updated `enrollments` directly with the caller's session,
-- but `enrollments` has no UPDATE policy for students (only staff "manage own
-- org"), so the update silently matched zero rows: learner progress never
-- advanced, courses could not be completed through the learning shell, and
-- completion certificates were never issued by that path. The action also
-- derived progress from client-supplied counts (viewedCount / totalBlocks).
--
-- A plain "students update own enrollment" policy would let a student set
-- progress_percent = 100 through PostgREST and mint a certificate. Instead,
-- this function derives progress from what the server already records — one
-- deduplicated `block_completion` engagement event per viewed block
-- (record_engagement_event) — over the course's published, non-module-header
-- blocks (the same set the learning shell navigates). It only ever touches the
-- caller's own enrollment in the caller's org, and never lowers progress.

CREATE OR REPLACE FUNCTION public.sync_my_course_progress(p_course_id uuid)
RETURNS TABLE (progress_percent numeric, just_completed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := public.current_user_uid();
  v_org       uuid := public.current_user_org_id();
  v_total     integer;
  v_viewed    integer;
  v_progress  numeric;
  v_existing  public.enrollments%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'Unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.enrollments e
  WHERE e.user_id = v_uid AND e.course_id = p_course_id AND e.org_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;  -- not enrolled: nothing to record
  END IF;

  SELECT count(*) INTO v_total
  FROM public.course_blocks cb
  WHERE cb.course_id = p_course_id
    AND cb.is_published
    AND cb.block_type_id <> 'module_header';

  SELECT count(DISTINCT ev.source_id) INTO v_viewed
  FROM public.engagement_events ev
  JOIN public.course_blocks cb ON cb.id = ev.source_id
  WHERE ev.user_id = v_uid
    AND ev.event_type = 'block_completion'
    AND ev.source_type = 'block'
    AND cb.course_id = p_course_id
    AND cb.is_published
    AND cb.block_type_id <> 'module_header';

  v_progress := CASE WHEN v_total = 0 THEN 0 ELSE round(100.0 * v_viewed / v_total) END;
  v_progress := greatest(v_progress, coalesce(v_existing.progress_percent, 0));

  UPDATE public.enrollments e
  SET last_accessed_at = now(),
      progress_percent = v_progress,
      transit_status   = CASE WHEN v_progress >= 100 THEN 'completed' ELSE 'in_progress' END,
      completed_at     = CASE WHEN v_progress >= 100 AND e.transit_status <> 'completed'
                              THEN now() ELSE e.completed_at END
  WHERE e.id = v_existing.id;

  RETURN QUERY SELECT v_progress, (v_progress >= 100 AND v_existing.transit_status <> 'completed');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_my_course_progress(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_course_progress(uuid) TO authenticated;
