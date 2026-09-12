-- Remove unused diagnostic variable from bulk_enroll_cohort for clean DB lint.

CREATE OR REPLACE FUNCTION public.bulk_enroll_cohort(
  p_job_id     UUID,
  p_cohort_id  UUID,
  p_section_id UUID,
  p_dry_run    BOOLEAN DEFAULT FALSE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_total    INTEGER := 0;
  v_enrolled INTEGER := 0;
  v_skipped  INTEGER := 0;
  v_failed   INTEGER := 0;
  v_member   RECORD;
  v_cursor   UUID;
  v_result   JSONB;
BEGIN
  IF public.current_user_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'bulk_enroll_cohort: insufficient privileges';
  END IF;

  IF NOT p_dry_run THEN
    UPDATE public.enrollment_jobs
    SET status = 'processing', started_at = NOW()
    WHERE id = p_job_id;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.cohort_members
  WHERE cohort_id = p_cohort_id AND status = 'active';

  UPDATE public.enrollment_jobs SET total_members = v_total WHERE id = p_job_id;

  FOR v_member IN
    SELECT cm.user_id
    FROM public.cohort_members cm
    WHERE cm.cohort_id = p_cohort_id AND cm.status = 'active'
    ORDER BY cm.user_id
  LOOP
    v_cursor := v_member.user_id;

    BEGIN
      IF p_dry_run THEN
        IF EXISTS (
          SELECT 1 FROM public.direct_enrollments de
          WHERE de.user_id = v_member.user_id AND de.section_id = p_section_id
        ) THEN
          v_skipped := v_skipped + 1;
        ELSE
          v_enrolled := v_enrolled + 1;
        END IF;
      ELSE
        INSERT INTO public.direct_enrollments
          (user_id, section_id, status, source, source_cohort_id, enrolled_by)
        VALUES
          (v_member.user_id, p_section_id, 'active', 'cohort', p_cohort_id, auth.uid())
        ON CONFLICT (user_id, section_id) DO NOTHING;

        IF FOUND THEN
          v_enrolled := v_enrolled + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;

    IF (v_enrolled + v_skipped + v_failed) % 50 = 0 AND NOT p_dry_run THEN
      UPDATE public.enrollment_jobs
      SET processed_count   = v_enrolled,
          skipped_count     = v_skipped,
          failed_count      = v_failed,
          last_batch_cursor = v_cursor
      WHERE id = p_job_id;
    END IF;
  END LOOP;

  v_result := jsonb_build_object(
    'total',    v_total,
    'enrolled', v_enrolled,
    'skipped',  v_skipped,
    'failed',   v_failed,
    'dry_run',  p_dry_run
  );

  IF NOT p_dry_run THEN
    UPDATE public.enrollment_jobs
    SET status          = CASE WHEN v_failed > 0 THEN 'partial' ELSE 'completed' END,
        processed_count = v_enrolled,
        skipped_count   = v_skipped,
        failed_count    = v_failed,
        result_summary  = v_result,
        completed_at    = NOW()
    WHERE id = p_job_id;

    PERFORM public.refresh_effective_enrollments();
  ELSE
    UPDATE public.enrollment_jobs
    SET status = 'dry_run', result_summary = v_result
    WHERE id = p_job_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bulk_enroll_cohort(UUID, UUID, UUID, BOOLEAN) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.bulk_enroll_cohort(UUID, UUID, UUID, BOOLEAN) TO authenticated;
