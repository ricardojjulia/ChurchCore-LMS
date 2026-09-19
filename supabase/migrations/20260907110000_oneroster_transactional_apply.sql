-- COUNCIL-2026-017: academic mutations and provenance must commit together.
CREATE OR REPLACE FUNCTION public.apply_oneroster_academic_job(
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
  v_data jsonb;
  v_type text;
  v_table text;
  v_id uuid;
  v_course_id uuid;
  v_term_id uuid;
  v_hash text;
  v_code text;
  v_active boolean;
  v_operation text;
  v_count integer;
  v_created integer := 0;
  v_updated integer := 0;
  v_unchanged integer := 0;
  v_deactivated integer := 0;
  v_quarantined integer := 0;
  v_error_code text;
  v_error_message text;
  v_status text;
BEGIN
  -- Service callers must still prove which active tenant and actor approved apply.
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
    RETURN jsonb_build_object('error', 'Import job is not ready to apply');
  END IF;
  IF v_job.expires_at <= clock_timestamp() THEN
    RETURN jsonb_build_object('error', 'Import job has expired and must be uploaded again');
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || v_job.source_system, 0)) THEN
    RETURN jsonb_build_object('error', 'Another import from this source is applying');
  END IF;

  SELECT count(*) INTO v_count FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND org_id = p_org_id;
  IF v_count <> v_job.total_rows OR EXISTS (
    SELECT 1 FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND (org_id <> p_org_id OR status <> 'valid')
  ) THEN
    RETURN jsonb_build_object('error', 'Import staging is incomplete; upload the package again');
  END IF;

  UPDATE public.oneroster_import_jobs SET status = 'applying', dry_run = false,
    started_at = now(), completed_at = NULL WHERE id = p_job_id AND org_id = p_org_id;

  FOR v_row IN
    SELECT * FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND org_id = p_org_id AND status = 'valid'
    ORDER BY CASE file_type WHEN 'manifest' THEN 0 WHEN 'orgs' THEN 1
      WHEN 'academicSessions' THEN 2 WHEN 'courses' THEN 3 WHEN 'classes' THEN 4
      ELSE 5 END, row_number, id
  LOOP
    v_error_code := 'apply_failed';
    v_error_message := 'Row could not be applied.';
    BEGIN
      IF v_row.file_type IN ('manifest', 'orgs') THEN
        UPDATE public.oneroster_import_rows SET operation = 'none', status = 'skipped'
          WHERE id = v_row.id AND org_id = p_org_id;
        v_unchanged := v_unchanged + 1;
        CONTINUE;
      END IF;
      IF v_row.file_type IN ('users', 'roles', 'enrollments') THEN
        v_error_code := 'identity_linking_required';
        v_error_message := 'User, role, and enrollment apply requires account linking.';
        RAISE EXCEPTION 'deferred identity row';
      END IF;
      IF v_row.sourced_id IS NULL THEN RAISE EXCEPTION 'missing source identifier'; END IF;

      v_type := CASE v_row.file_type WHEN 'academicSessions' THEN 'academic_session'
        WHEN 'courses' THEN 'course' WHEN 'classes' THEN 'class' END;
      v_table := CASE v_row.file_type WHEN 'academicSessions' THEN 'academic_terms'
        WHEN 'courses' THEN 'course_blueprints' WHEN 'classes' THEN 'course_sections' END;
      IF v_type IS NULL THEN RAISE EXCEPTION 'unsupported file'; END IF;
      v_data := v_row.normalized_payload;
      v_hash := encode(digest(v_data::text, 'sha256'), 'hex');
      v_active := coalesce(v_data->>'status', '') NOT IN ('tobedeleted', 'inactive');

      SELECT * INTO v_link FROM public.external_entity_links
        WHERE org_id = p_org_id AND source_system = v_job.source_system
          AND object_type = v_type AND sourced_id = v_row.sourced_id;
      IF FOUND THEN
        IF v_link.local_table <> v_table OR v_link.source_tenant_id IS DISTINCT FROM v_job.source_tenant_id THEN
          RAISE EXCEPTION 'source mapping mismatch';
        END IF;
        v_id := v_link.local_id;
        -- Links are not foreign keys: check the target even on an unchanged hash.
        IF (v_type = 'academic_session' AND NOT EXISTS (SELECT 1 FROM public.academic_terms WHERE id = v_id AND org_id = p_org_id))
          OR (v_type = 'course' AND NOT EXISTS (SELECT 1 FROM public.course_blueprints WHERE id = v_id AND org_id = p_org_id))
          OR (v_type = 'class' AND NOT EXISTS (SELECT 1 FROM public.course_sections WHERE id = v_id AND org_id = p_org_id)) THEN
          RAISE EXCEPTION 'source target missing';
        END IF;
        IF v_link.sync_hash = v_hash THEN
          UPDATE public.external_entity_links SET last_seen_at = now()
            WHERE id = v_link.id AND org_id = p_org_id;
          UPDATE public.oneroster_import_rows SET operation = 'unchanged', status = 'skipped',
            error_code = NULL, error_message = NULL WHERE id = v_row.id AND org_id = p_org_id;
          v_unchanged := v_unchanged + 1;
          CONTINUE;
        END IF;
        v_operation := CASE WHEN v_active THEN 'update' ELSE 'deactivate' END;
      ELSE
        IF NOT v_active THEN
          UPDATE public.oneroster_import_rows SET operation = 'none', status = 'skipped'
            WHERE id = v_row.id AND org_id = p_org_id;
          v_unchanged := v_unchanged + 1;
          CONTINUE;
        END IF;
        v_id := gen_random_uuid();
        v_operation := 'create';
      END IF;

      v_code := coalesce(nullif(left(trim(both '-' from regexp_replace(upper(coalesce(
        nullif(v_data->>'courseCode', ''), nullif(v_data->>'classCode', ''),
        nullif(v_data->>'title', ''), 'ONEROSTER')), '[^A-Z0-9]+', '-', 'g')), 24), ''), 'ONEROSTER')
        || '-' || upper(substr(encode(digest(p_org_id::text || ':' || v_job.source_system || ':' || v_row.sourced_id, 'sha256'), 'hex'), 1, 16));

      IF v_operation = 'deactivate' THEN
        IF v_type = 'academic_session' THEN
          UPDATE public.academic_terms SET is_active = false WHERE id = v_id AND org_id = p_org_id;
        ELSIF v_type = 'course' THEN
          UPDATE public.course_blueprints SET is_active = false WHERE id = v_id AND org_id = p_org_id;
        ELSE
          UPDATE public.course_sections SET is_active = false WHERE id = v_id AND org_id = p_org_id;
        END IF;
      ELSIF v_type = 'academic_session' THEN
        IF v_operation = 'create' THEN
          INSERT INTO public.academic_terms(id, org_id, term_name, term_code, type, start_date, end_date, is_active, created_by)
          VALUES (v_id, p_org_id, v_data->>'title', v_code,
            CASE v_data->>'type' WHEN 'schoolYear' THEN 'academic_year' WHEN 'semester' THEN 'semester'
              WHEN 'term' THEN 'semester' WHEN 'gradingPeriod' THEN 'block' ELSE 'ad_hoc' END,
            (v_data->>'startDate')::date, (v_data->>'endDate')::date, true, p_actor_auth_id);
        ELSE
          UPDATE public.academic_terms SET term_name = v_data->>'title',
            type = CASE v_data->>'type' WHEN 'schoolYear' THEN 'academic_year' WHEN 'semester' THEN 'semester'
              WHEN 'term' THEN 'semester' WHEN 'gradingPeriod' THEN 'block' ELSE 'ad_hoc' END,
            start_date = (v_data->>'startDate')::date, end_date = (v_data->>'endDate')::date, is_active = true
            WHERE id = v_id AND org_id = p_org_id;
        END IF;
      ELSIF v_type = 'course' THEN
        IF v_operation = 'create' THEN
          INSERT INTO public.course_blueprints(id, org_id, course_code, title, is_active, created_by)
            VALUES (v_id, p_org_id, v_code, v_data->>'title', true, p_actor_auth_id);
        ELSE
          UPDATE public.course_blueprints SET title = v_data->>'title', is_active = true
            WHERE id = v_id AND org_id = p_org_id;
        END IF;
      ELSE
        IF cardinality(string_to_array(v_data->>'termSourcedIds', ',')) IS DISTINCT FROM 1 THEN
          v_error_code := 'unsupported_term_mapping';
          v_error_message := 'Class must reference exactly one academic session.';
          RAISE EXCEPTION 'ambiguous term mapping';
        END IF;
        SELECT l.local_id INTO v_course_id FROM public.external_entity_links l
          JOIN public.course_blueprints b ON b.id = l.local_id AND b.org_id = p_org_id AND b.is_active
          WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system AND l.object_type = 'course'
            AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
            AND l.local_table = 'course_blueprints' AND l.sourced_id = v_data->>'courseSourcedId';
        SELECT l.local_id INTO v_term_id FROM public.external_entity_links l
          JOIN public.academic_terms t ON t.id = l.local_id AND t.org_id = p_org_id AND t.is_active
          WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system AND l.object_type = 'academic_session'
            AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
            AND l.local_table = 'academic_terms' AND l.sourced_id = trim(v_data->>'termSourcedIds');
        IF v_course_id IS NULL OR v_term_id IS NULL THEN
          v_error_code := 'missing_local_reference';
          v_error_message := 'Class references are not applied yet.';
          RAISE EXCEPTION 'missing class references';
        END IF;
        IF v_operation = 'create' THEN
          INSERT INTO public.course_sections(id, org_id, blueprint_id, term_id, section_code, delivery_format, is_active, enrollment_type, created_by)
            VALUES (v_id, p_org_id, v_course_id, v_term_id, v_code,
              CASE WHEN v_data->>'classType' = 'scheduled' THEN 'synchronous' ELSE 'asynchronous' END,
              true, 'invite_only', p_actor_auth_id);
        ELSE
          UPDATE public.course_sections SET blueprint_id = v_course_id, term_id = v_term_id, section_code = v_code,
            delivery_format = CASE WHEN v_data->>'classType' = 'scheduled' THEN 'synchronous' ELSE 'asynchronous' END,
            is_active = true WHERE id = v_id AND org_id = p_org_id;
        END IF;
      END IF;

      INSERT INTO public.external_entity_links(org_id, source_system, source_tenant_id, object_type,
        sourced_id, sourced_id_hash, local_table, local_id, source_status, date_last_modified, sync_hash)
      VALUES (p_org_id, v_job.source_system, v_job.source_tenant_id, v_type, v_row.sourced_id,
        encode(digest(v_row.sourced_id, 'sha256'), 'hex'), v_table, v_id,
        CASE WHEN v_active THEN 'active' ELSE 'inactive' END,
        nullif(v_data->>'dateLastModified', '')::timestamptz, v_hash)
      ON CONFLICT (org_id, source_system, object_type, sourced_id) DO UPDATE SET
        source_status = EXCLUDED.source_status, date_last_modified = EXCLUDED.date_last_modified,
        sync_hash = EXCLUDED.sync_hash, last_seen_at = now(), updated_at = now();

      UPDATE public.oneroster_import_rows SET operation = v_operation, status = 'applied',
        error_code = NULL, error_message = NULL WHERE id = v_row.id AND org_id = p_org_id;
      IF v_operation = 'create' THEN v_created := v_created + 1;
      ELSIF v_operation = 'update' THEN v_updated := v_updated + 1;
      ELSE v_deactivated := v_deactivated + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      -- This subtransaction rolls back the target write if its mapping failed.
      UPDATE public.oneroster_import_rows SET operation = 'quarantine', status = 'quarantined',
        error_code = v_error_code, error_message = v_error_message WHERE id = v_row.id AND org_id = p_org_id;
      v_quarantined := v_quarantined + 1;
    END;
  END LOOP;

  v_status := CASE WHEN v_quarantined > 0 THEN 'failed' ELSE 'applied' END;
  UPDATE public.oneroster_import_jobs SET status = v_status, completed_at = now(),
    created_count = v_created, updated_count = v_updated, unchanged_count = v_unchanged,
    deactivated_count = v_deactivated, quarantined_count = v_quarantined,
    error_count = v_quarantined, error_summary = jsonb_build_object('quarantined', v_quarantined)
    WHERE id = p_job_id AND org_id = p_org_id;
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, org_id, metadata)
    VALUES (p_actor_auth_id, 'oneroster_apply', 'oneroster_import_job', p_job_id, p_org_id,
      jsonb_build_object('created_count', v_created, 'updated_count', v_updated,
        'unchanged_count', v_unchanged, 'deactivated_count', v_deactivated, 'quarantined_count', v_quarantined));
  RETURN jsonb_build_object('success', true, 'status', v_status, 'created', v_created,
    'updated', v_updated, 'unchanged', v_unchanged, 'deactivated', v_deactivated, 'quarantined', v_quarantined);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_oneroster_academic_job(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_oneroster_academic_job(uuid, uuid, uuid, uuid) TO service_role;
