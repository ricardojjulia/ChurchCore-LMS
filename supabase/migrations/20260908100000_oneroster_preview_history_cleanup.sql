-- Preview academic changes with the same provenance/hash rules used by apply.
CREATE OR REPLACE FUNCTION public.preview_oneroster_academic_job(
  p_job_id uuid, p_org_id uuid, p_actor_auth_id uuid, p_actor_uid uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_job public.oneroster_import_jobs%ROWTYPE;
  v_row public.oneroster_import_rows%ROWTYPE;
  v_link public.external_entity_links%ROWTYPE;
  v_type text;
  v_table text;
  v_hash text;
  v_active boolean;
  v_operation text;
  v_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_deactivated integer := 0;
  v_quarantined integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.auth_id = p_actor_auth_id AND pr.uid = p_actor_uid
      AND pr.org_id = p_org_id AND pr.tenant_active
      AND pr.role IN ('admin', 'manager')
  ) THEN
    RETURN jsonb_build_object('error', 'Import is not permitted for this account');
  END IF;

  SELECT * INTO v_job FROM public.oneroster_import_jobs
    WHERE id = p_job_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Import job not found');
  END IF;
  IF v_job.status NOT IN ('validated', 'ready') THEN
    RETURN jsonb_build_object('error', 'Import job is not ready to preview');
  END IF;
  IF v_job.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('error', 'Import job has expired and must be uploaded again');
  END IF;

  SELECT count(*) INTO v_count FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND org_id = p_org_id;
  IF v_count <> v_job.total_rows OR EXISTS (
    SELECT 1 FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND (org_id <> p_org_id OR status <> 'valid')
  ) THEN
    RETURN jsonb_build_object('error', 'Import staging is incomplete; upload the package again');
  END IF;

  FOR v_row IN
    SELECT * FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND org_id = p_org_id
    ORDER BY CASE file_type WHEN 'manifest' THEN 0 WHEN 'orgs' THEN 1
      WHEN 'academicSessions' THEN 2 WHEN 'courses' THEN 3 WHEN 'classes' THEN 4
      ELSE 5 END, row_number, id
  LOOP
    v_operation := 'quarantine';
    IF v_row.file_type IN ('manifest', 'orgs') THEN
      v_operation := 'unchanged';
    ELSIF v_row.file_type IN ('users', 'roles', 'enrollments') THEN
      v_operation := 'quarantine';
    ELSIF v_row.sourced_id IS NOT NULL THEN
      v_type := CASE v_row.file_type WHEN 'academicSessions' THEN 'academic_session'
        WHEN 'courses' THEN 'course' WHEN 'classes' THEN 'class' END;
      v_table := CASE v_row.file_type WHEN 'academicSessions' THEN 'academic_terms'
        WHEN 'courses' THEN 'course_blueprints' WHEN 'classes' THEN 'course_sections' END;
      IF v_type IS NOT NULL THEN
        v_hash := encode(digest(v_row.normalized_payload::text, 'sha256'), 'hex');
        v_active := coalesce(v_row.normalized_payload->>'status', '') NOT IN ('tobedeleted', 'inactive');
        SELECT * INTO v_link FROM public.external_entity_links
          WHERE org_id = p_org_id AND source_system = v_job.source_system
            AND object_type = v_type AND sourced_id = v_row.sourced_id;
        IF FOUND THEN
          IF v_link.local_table <> v_table
            OR v_link.source_tenant_id IS DISTINCT FROM v_job.source_tenant_id
            OR (v_type = 'academic_session' AND NOT EXISTS (SELECT 1 FROM public.academic_terms WHERE id = v_link.local_id AND org_id = p_org_id))
            OR (v_type = 'course' AND NOT EXISTS (SELECT 1 FROM public.course_blueprints WHERE id = v_link.local_id AND org_id = p_org_id))
            OR (v_type = 'class' AND NOT EXISTS (SELECT 1 FROM public.course_sections WHERE id = v_link.local_id AND org_id = p_org_id)) THEN
            v_operation := 'quarantine';
          ELSIF v_link.sync_hash = v_hash THEN
            v_operation := 'unchanged';
          ELSIF v_active THEN
            v_operation := 'update';
          ELSE
            v_operation := 'deactivate';
          END IF;
        ELSIF v_active THEN
          v_operation := 'create';
        ELSE
          v_operation := 'unchanged';
        END IF;
      END IF;
    END IF;

    UPDATE public.oneroster_import_rows SET operation = v_operation
      WHERE id = v_row.id AND org_id = p_org_id;
    IF v_operation = 'create' THEN v_created := v_created + 1;
    ELSIF v_operation = 'update' THEN v_updated := v_updated + 1;
    ELSIF v_operation = 'unchanged' THEN v_unchanged := v_unchanged + 1;
    ELSIF v_operation = 'deactivate' THEN v_deactivated := v_deactivated + 1;
    ELSE v_quarantined := v_quarantined + 1;
    END IF;
  END LOOP;

  UPDATE public.oneroster_import_jobs SET
    created_count = v_created, updated_count = v_updated,
    unchanged_count = v_unchanged, deactivated_count = v_deactivated,
    quarantined_count = v_quarantined
    WHERE id = p_job_id AND org_id = p_org_id;
  RETURN jsonb_build_object('created', v_created, 'updated', v_updated,
    'unchanged', v_unchanged, 'deactivated', v_deactivated,
    'quarantined', v_quarantined);
END;
$$;

REVOKE ALL ON FUNCTION public.preview_oneroster_academic_job(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_oneroster_academic_job(uuid, uuid, uuid, uuid) TO service_role;

-- Expired jobs contain only short-lived staging data; rows cascade with the job.
CREATE OR REPLACE FUNCTION public.purge_expired_oneroster_staging()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted bigint;
BEGIN
  DELETE FROM public.oneroster_import_jobs
  WHERE expires_at <= clock_timestamp() AND status <> 'applying';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_oneroster_staging() FROM PUBLIC, anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'oneroster-staging-cleanup';
    PERFORM cron.schedule('oneroster-staging-cleanup', '17 * * * *',
      'SELECT public.purge_expired_oneroster_staging();');
  END IF;
END;
$$;
