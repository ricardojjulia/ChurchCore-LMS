-- Use the preview enrollment class lookup directly so linked DB lint has no
-- dead PL/pgSQL variables to report.

CREATE OR REPLACE FUNCTION public.preview_oneroster_job(
  p_job_id uuid, p_org_id uuid, p_actor_auth_id uuid, p_actor_uid uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_base jsonb;
  v_job public.oneroster_import_jobs%ROWTYPE;
  v_row public.oneroster_import_rows%ROWTYPE;
  v_link public.external_entity_links%ROWTYPE;
  v_user_link public.external_entity_links%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_section public.course_sections%ROWTYPE;
  v_operation text;
  v_error_code text;
  v_error_message text;
  v_hash text;
  v_active boolean;
  v_mapped_role text;
  v_created integer;
  v_updated integer;
  v_unchanged integer;
  v_deactivated integer;
  v_quarantined integer;
BEGIN
  v_base := public.preview_oneroster_academic_job(p_job_id, p_org_id, p_actor_auth_id, p_actor_uid);
  IF v_base ? 'error' THEN RETURN v_base; END IF;

  SELECT * INTO v_job FROM public.oneroster_import_jobs
  WHERE id = p_job_id AND org_id = p_org_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Import job not found'); END IF;

  v_created := (v_base->>'created')::integer;
  v_updated := (v_base->>'updated')::integer;
  v_unchanged := (v_base->>'unchanged')::integer;
  v_deactivated := (v_base->>'deactivated')::integer;
  v_quarantined := (v_base->>'quarantined')::integer;

  FOR v_row IN
    SELECT * FROM public.oneroster_import_rows
    WHERE job_id = p_job_id AND org_id = p_org_id AND status = 'valid'
      AND file_type IN ('users', 'roles', 'enrollments')
    ORDER BY CASE file_type WHEN 'users' THEN 0 WHEN 'roles' THEN 1 ELSE 2 END, row_number, id
  LOOP
    v_operation := NULL;
    v_error_code := 'identity_linking_required';
    v_error_message := 'An existing LMS account link is required before applying roster identity data.';
    v_hash := encode(digest(v_row.normalized_payload::text, 'sha256'), 'hex');
    v_active := coalesce(v_row.normalized_payload->>'status', '') NOT IN ('tobedeleted', 'inactive');

    IF v_row.file_type = 'users' THEN
      SELECT * INTO v_link FROM public.external_entity_links
      WHERE org_id = p_org_id AND source_system = v_job.source_system
        AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
        AND object_type = 'user' AND sourced_id = v_row.sourced_id
        AND local_table = 'profiles';
      IF FOUND THEN
        SELECT * INTO v_profile FROM public.profiles
        WHERE uid = v_link.local_id AND org_id = p_org_id AND status <> 'archived';
        IF FOUND THEN
          v_operation := CASE
            WHEN v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN 'unchanged'
            WHEN v_active THEN 'update' ELSE 'deactivate' END;
        ELSE
          v_error_code := 'identity_target_missing';
          v_error_message := 'Linked LMS profile is no longer available.';
        END IF;
      END IF;
    ELSIF v_row.file_type = 'roles' THEN
      v_mapped_role := public.oneroster_safe_role(v_row.normalized_payload->>'role');
      SELECT l.* INTO v_user_link FROM public.external_entity_links l
      WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
        AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
        AND l.object_type = 'user' AND l.sourced_id = v_row.normalized_payload->>'userSourcedId'
        AND l.local_table = 'profiles';
      IF NOT FOUND THEN
        v_error_code := 'identity_linking_required';
      ELSE
        SELECT * INTO v_profile FROM public.profiles
        WHERE uid = v_user_link.local_id AND org_id = p_org_id AND status <> 'archived';
        IF NOT FOUND THEN
          v_error_code := 'identity_target_missing';
          v_error_message := 'Linked LMS profile is no longer available.';
        ELSIF v_mapped_role IS NULL THEN
          v_error_code := 'role_requires_approval';
          v_error_message := 'Only student and teacher roster roles can be applied automatically.';
        ELSIF v_profile.role IN ('admin', 'manager') THEN
          v_error_code := 'privileged_role_requires_approval';
          v_error_message := 'Roster data cannot overwrite an LMS admin or manager role.';
        ELSIF EXISTS (
          SELECT 1 FROM public.external_entity_links other
          WHERE other.org_id = p_org_id AND other.source_system = v_job.source_system
            AND other.object_type = 'role' AND other.local_table = 'profile_roles'
            AND other.local_id = v_profile.uid AND other.sourced_id <> v_row.sourced_id
        ) THEN
          v_error_code := 'multiple_roles_not_supported';
          v_error_message := 'This LMS profile already has another linked roster role.';
        ELSE
          SELECT * INTO v_link FROM public.external_entity_links
          WHERE org_id = p_org_id AND source_system = v_job.source_system
            AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
            AND object_type = 'role' AND sourced_id = v_row.sourced_id
            AND local_table = 'profile_roles';
          v_operation := CASE WHEN NOT FOUND THEN 'create'
            WHEN v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN 'unchanged'
            WHEN v_active THEN 'update' ELSE 'deactivate' END;
        END IF;
      END IF;
    ELSE
      IF lower(coalesce(v_row.normalized_payload->>'role', '')) <> 'student' THEN
        v_error_code := 'enrollment_role_not_supported';
        v_error_message := 'Only student roster enrollments map to LMS direct enrollments.';
      ELSE
        SELECT l.* INTO v_user_link FROM public.external_entity_links l
        WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
          AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND l.object_type = 'user' AND l.sourced_id = v_row.normalized_payload->>'userSourcedId'
          AND l.local_table = 'profiles';
        SELECT cs.* INTO v_section
        FROM public.external_entity_links l
        JOIN public.course_sections cs ON cs.id = l.local_id AND cs.org_id = p_org_id AND cs.is_active
        WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
          AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND l.object_type = 'class' AND l.sourced_id = v_row.normalized_payload->>'classSourcedId'
          AND l.local_table = 'course_sections';
        IF v_section.id IS NULL OR v_user_link.id IS NULL THEN
          v_error_code := 'identity_reference_required';
          v_error_message := 'Enrollment requires linked user and class records.';
        ELSE
          SELECT * INTO v_link FROM public.external_entity_links
          WHERE org_id = p_org_id AND source_system = v_job.source_system
            AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
            AND object_type = 'enrollment' AND sourced_id = v_row.sourced_id
            AND local_table = 'direct_enrollments';
          v_operation := CASE WHEN NOT FOUND THEN CASE WHEN v_active THEN 'create' ELSE 'unchanged' END
            WHEN v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN 'unchanged'
            WHEN v_active THEN 'update' ELSE 'deactivate' END;
        END IF;
      END IF;
    END IF;

    IF v_operation IS NULL THEN
      UPDATE public.oneroster_import_rows SET operation = 'quarantine', error_code = v_error_code, error_message = v_error_message
      WHERE id = v_row.id AND org_id = p_org_id;
      CONTINUE;
    END IF;

    UPDATE public.oneroster_import_rows SET operation = v_operation, error_code = NULL, error_message = NULL
    WHERE id = v_row.id AND org_id = p_org_id;
    v_quarantined := v_quarantined - 1;
    IF v_operation = 'create' THEN v_created := v_created + 1;
    ELSIF v_operation = 'update' THEN v_updated := v_updated + 1;
    ELSIF v_operation = 'deactivate' THEN v_deactivated := v_deactivated + 1;
    ELSE v_unchanged := v_unchanged + 1;
    END IF;
  END LOOP;

  UPDATE public.oneroster_import_jobs SET
    created_count = v_created, updated_count = v_updated, unchanged_count = v_unchanged,
    deactivated_count = v_deactivated, quarantined_count = v_quarantined
  WHERE id = p_job_id AND org_id = p_org_id;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated, 'unchanged', v_unchanged,
    'deactivated', v_deactivated, 'quarantined', v_quarantined);
END;
$$;

REVOKE ALL ON FUNCTION public.preview_oneroster_job(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_oneroster_job(uuid, uuid, uuid, uuid) TO service_role;
