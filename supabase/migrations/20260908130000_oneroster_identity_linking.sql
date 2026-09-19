-- OneRoster identity linking is explicit and existing-account-only.
-- The importer never creates auth.users from roster data.

CREATE OR REPLACE FUNCTION public.oneroster_safe_role(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(p_role, '')))
    WHEN 'student' THEN 'student'
    WHEN 'teacher' THEN 'teacher'
    ELSE NULL
  END;
$$;

REVOKE ALL ON FUNCTION public.oneroster_safe_role(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_oneroster_user(
  p_job_id uuid,
  p_org_id uuid,
  p_sourced_id text,
  p_profile_uid uuid,
  p_actor_auth_id uuid,
  p_actor_uid uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_job public.oneroster_import_jobs%ROWTYPE;
  v_row public.oneroster_import_rows%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_link public.external_entity_links%ROWTYPE;
  v_hash text;
  v_active boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr
    WHERE pr.auth_id = p_actor_auth_id AND pr.uid = p_actor_uid
      AND pr.org_id = p_org_id AND pr.tenant_active
      AND pr.role IN ('admin', 'manager')
  ) THEN
    RETURN jsonb_build_object('error', 'Identity linking is not permitted for this account');
  END IF;

  SELECT * INTO v_job
  FROM public.oneroster_import_jobs
  WHERE id = p_job_id AND org_id = p_org_id;
  IF NOT FOUND OR v_job.status NOT IN ('validated', 'ready') THEN
    RETURN jsonb_build_object('error', 'Import job is not ready for identity linking');
  END IF;

  SELECT * INTO v_row
  FROM public.oneroster_import_rows
  WHERE job_id = p_job_id AND org_id = p_org_id
    AND file_type = 'users' AND sourced_id = p_sourced_id;
  IF NOT FOUND OR v_row.status NOT IN ('valid', 'quarantined') THEN
    RETURN jsonb_build_object('error', 'Roster user was not found in this import');
  END IF;
  IF v_row.status = 'quarantined' AND v_row.error_code IS DISTINCT FROM 'identity_linking_required' THEN
    RETURN jsonb_build_object('error', 'Roster user failed validation and cannot be linked');
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE uid = p_profile_uid AND org_id = p_org_id;
  IF NOT FOUND OR v_profile.status = 'archived' THEN
    RETURN jsonb_build_object('error', 'Target LMS profile is not available in this organization');
  END IF;

  SELECT * INTO v_link
  FROM public.external_entity_links
  WHERE org_id = p_org_id AND source_system = v_job.source_system
    AND object_type = 'user' AND sourced_id = p_sourced_id;
  IF FOUND AND (v_link.local_table <> 'profiles' OR v_link.local_id <> p_profile_uid
      OR v_link.source_tenant_id IS DISTINCT FROM v_job.source_tenant_id) THEN
    RETURN jsonb_build_object('error', 'Roster user is already linked to another LMS profile');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.external_entity_links existing
    WHERE existing.org_id = p_org_id AND existing.source_system = v_job.source_system
      AND existing.object_type = 'user' AND existing.local_table = 'profiles'
      AND existing.local_id = p_profile_uid AND existing.sourced_id <> p_sourced_id
  ) THEN
    RETURN jsonb_build_object('error', 'LMS profile is already linked to another roster user');
  END IF;

  v_hash := encode(digest(v_row.normalized_payload::text, 'sha256'), 'hex');
  v_active := coalesce(v_row.normalized_payload->>'status', '') NOT IN ('tobedeleted', 'inactive')
    AND coalesce(v_row.normalized_payload->>'enabledUser', 'true') <> 'false';

  INSERT INTO public.external_entity_links(
    org_id, connection_id, source_system, source_tenant_id, object_type,
    sourced_id, sourced_id_hash, local_table, local_id, source_status,
    sync_hash, managed_by_external_system, metadata
  ) VALUES (
    p_org_id, v_job.connection_id, v_job.source_system, v_job.source_tenant_id, 'user',
    p_sourced_id, encode(digest(p_sourced_id, 'sha256'), 'hex'), 'profiles', p_profile_uid,
    CASE WHEN v_active THEN 'active' ELSE 'inactive' END,
    v_hash, true, jsonb_build_object('linked_by', p_actor_auth_id)
  )
  ON CONFLICT (org_id, source_system, object_type, sourced_id) DO UPDATE SET
    connection_id = EXCLUDED.connection_id,
    source_tenant_id = EXCLUDED.source_tenant_id,
    local_table = EXCLUDED.local_table,
    local_id = EXCLUDED.local_id,
    source_status = EXCLUDED.source_status,
    sync_hash = EXCLUDED.sync_hash,
    last_seen_at = now(),
    updated_at = now(),
    metadata = public.external_entity_links.metadata || EXCLUDED.metadata;

  RETURN jsonb_build_object('success', true, 'sourced_id_hash', encode(digest(p_sourced_id, 'sha256'), 'hex'), 'profile_uid', p_profile_uid);
END;
$$;

REVOKE ALL ON FUNCTION public.link_oneroster_user(uuid, uuid, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_oneroster_user(uuid, uuid, text, uuid, uuid, uuid) TO service_role;

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
        IF NOT FOUND OR v_user_link.id IS NULL THEN
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

CREATE OR REPLACE FUNCTION public.apply_oneroster_job(
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
  v_enrollment public.direct_enrollments%ROWTYPE;
  v_operation text;
  v_error_code text;
  v_error_message text;
  v_hash text;
  v_active boolean;
  v_mapped_role text;
  v_user_auth_id uuid;
  v_existing_role_link boolean;
  v_created integer;
  v_updated integer;
  v_unchanged integer;
  v_deactivated integer;
  v_quarantined integer;
  v_status text;
BEGIN
  v_base := public.apply_oneroster_academic_job(p_job_id, p_org_id, p_actor_auth_id, p_actor_uid);
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
    WHERE job_id = p_job_id AND org_id = p_org_id
      AND file_type IN ('users', 'roles', 'enrollments')
      AND status = 'quarantined' AND error_code = 'identity_linking_required'
    ORDER BY CASE file_type WHEN 'users' THEN 0 WHEN 'roles' THEN 1 ELSE 2 END, row_number, id
  LOOP
    v_operation := NULL;
    v_error_code := 'identity_linking_required';
    v_error_message := 'An existing LMS account link is required before applying roster identity data.';
    v_hash := encode(digest(v_row.normalized_payload::text, 'sha256'), 'hex');
    v_active := coalesce(v_row.normalized_payload->>'status', '') NOT IN ('tobedeleted', 'inactive');

    BEGIN
      IF v_row.file_type = 'users' THEN
        SELECT * INTO v_link FROM public.external_entity_links
        WHERE org_id = p_org_id AND source_system = v_job.source_system
          AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND object_type = 'user' AND sourced_id = v_row.sourced_id
          AND local_table = 'profiles';
        IF NOT FOUND THEN RAISE EXCEPTION 'identity link required'; END IF;
        SELECT * INTO v_profile FROM public.profiles
        WHERE uid = v_link.local_id AND org_id = p_org_id AND status <> 'archived';
        IF NOT FOUND THEN
          v_error_code := 'identity_target_missing';
          v_error_message := 'Linked LMS profile is no longer available.';
          RAISE EXCEPTION 'identity target missing';
        END IF;
        v_operation := CASE
          WHEN v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN 'unchanged'
          WHEN v_active THEN 'update' ELSE 'deactivate' END;
        UPDATE public.external_entity_links SET
          source_status = CASE WHEN v_active THEN 'active' ELSE 'inactive' END,
          sync_hash = v_hash, last_seen_at = now(), updated_at = now()
        WHERE id = v_link.id AND org_id = p_org_id;

      ELSIF v_row.file_type = 'roles' THEN
        v_mapped_role := public.oneroster_safe_role(v_row.normalized_payload->>'role');
        SELECT l.* INTO v_user_link
        FROM public.external_entity_links l
        JOIN public.profiles p ON p.uid = l.local_id AND p.org_id = p_org_id AND p.status <> 'archived'
        WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
          AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND l.object_type = 'user' AND l.sourced_id = v_row.normalized_payload->>'userSourcedId'
          AND l.local_table = 'profiles';
        IF NOT FOUND THEN RAISE EXCEPTION 'identity link required'; END IF;
        SELECT * INTO v_profile FROM public.profiles
        WHERE uid = v_user_link.local_id AND org_id = p_org_id AND status <> 'archived';
        IF v_mapped_role IS NULL THEN
          v_error_code := 'role_requires_approval';
          v_error_message := 'Only student and teacher roster roles can be applied automatically.';
          RAISE EXCEPTION 'role requires approval';
        END IF;
        IF v_profile.role IN ('admin', 'manager') THEN
          v_error_code := 'privileged_role_requires_approval';
          v_error_message := 'Roster data cannot overwrite an LMS admin or manager role.';
          RAISE EXCEPTION 'privileged role';
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.external_entity_links other
          WHERE other.org_id = p_org_id AND other.source_system = v_job.source_system
            AND other.object_type = 'role' AND other.local_table = 'profile_roles'
            AND other.local_id = v_profile.uid AND other.sourced_id <> v_row.sourced_id
        ) THEN
          v_error_code := 'multiple_roles_not_supported';
          v_error_message := 'This LMS profile already has another linked roster role.';
          RAISE EXCEPTION 'multiple roles';
        END IF;
        SELECT * INTO v_link FROM public.external_entity_links
        WHERE org_id = p_org_id AND source_system = v_job.source_system
          AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND object_type = 'role' AND sourced_id = v_row.sourced_id
          AND local_table = 'profile_roles';
        v_existing_role_link := FOUND;
        IF NOT v_existing_role_link THEN
          v_operation := CASE WHEN v_active THEN 'create' ELSE 'unchanged' END;
        ELSIF v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN
          v_operation := 'unchanged';
        ELSE
          v_operation := CASE WHEN v_active THEN 'update' ELSE 'deactivate' END;
        END IF;
        IF v_operation IN ('create', 'update') THEN
          UPDATE public.profiles SET role = v_mapped_role::public.user_role
          WHERE uid = v_profile.uid AND org_id = p_org_id;
        ELSIF v_operation = 'deactivate' THEN
          UPDATE public.profiles SET role = 'student'::public.user_role
          WHERE uid = v_profile.uid AND org_id = p_org_id AND role::text = v_mapped_role;
        END IF;
        IF v_operation <> 'unchanged' OR v_existing_role_link THEN
          INSERT INTO public.external_entity_links(
            org_id, connection_id, source_system, source_tenant_id, object_type,
            sourced_id, sourced_id_hash, local_table, local_id, source_status, sync_hash
          ) VALUES (
            p_org_id, v_job.connection_id, v_job.source_system, v_job.source_tenant_id, 'role',
            v_row.sourced_id, encode(digest(v_row.sourced_id, 'sha256'), 'hex'), 'profile_roles', v_profile.uid,
            CASE WHEN v_active THEN 'active' ELSE 'inactive' END, v_hash
          )
          ON CONFLICT (org_id, source_system, object_type, sourced_id) DO UPDATE SET
            source_status = EXCLUDED.source_status, sync_hash = EXCLUDED.sync_hash,
            last_seen_at = now(), updated_at = now();
        END IF;

      ELSE
        IF lower(coalesce(v_row.normalized_payload->>'role', '')) <> 'student' THEN
          v_error_code := 'enrollment_role_not_supported';
          v_error_message := 'Only student roster enrollments map to LMS direct enrollments.';
          RAISE EXCEPTION 'enrollment role';
        END IF;
        SELECT l.* INTO v_user_link
        FROM public.external_entity_links l
        JOIN public.profiles p ON p.uid = l.local_id AND p.org_id = p_org_id AND p.status <> 'archived'
        WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
          AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND l.object_type = 'user' AND l.sourced_id = v_row.normalized_payload->>'userSourcedId'
          AND l.local_table = 'profiles';
        IF NOT FOUND THEN RAISE EXCEPTION 'identity link required'; END IF;
        SELECT p.auth_id INTO v_user_auth_id
        FROM public.profiles p
        WHERE p.uid = v_user_link.local_id AND p.org_id = p_org_id;
        SELECT cs.* INTO v_section
        FROM public.external_entity_links l
        JOIN public.course_sections cs ON cs.id = l.local_id AND cs.org_id = p_org_id AND cs.is_active
        WHERE l.org_id = p_org_id AND l.source_system = v_job.source_system
          AND l.source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND l.object_type = 'class' AND l.sourced_id = v_row.normalized_payload->>'classSourcedId'
          AND l.local_table = 'course_sections';
        IF NOT FOUND THEN
          v_error_code := 'missing_class_link';
          v_error_message := 'Enrollment references a class that is not linked to an active LMS section.';
          RAISE EXCEPTION 'class link missing';
        END IF;
        SELECT * INTO v_link FROM public.external_entity_links
        WHERE org_id = p_org_id AND source_system = v_job.source_system
          AND source_tenant_id IS NOT DISTINCT FROM v_job.source_tenant_id
          AND object_type = 'enrollment' AND sourced_id = v_row.sourced_id
          AND local_table = 'direct_enrollments';
        IF NOT FOUND AND NOT v_active THEN
          v_operation := 'unchanged';
        ELSIF NOT FOUND THEN
          INSERT INTO public.direct_enrollments(user_id, section_id, status, source, enrolled_by, org_id)
          VALUES (v_user_auth_id, v_section.id, 'active', 'import', p_actor_auth_id, p_org_id)
          RETURNING * INTO v_enrollment;
          v_operation := 'create';
        ELSE
          SELECT * INTO v_enrollment FROM public.direct_enrollments
          WHERE id = v_link.local_id AND org_id = p_org_id;
          IF NOT FOUND THEN
            v_error_code := 'enrollment_target_missing';
            v_error_message := 'Linked LMS enrollment is no longer available.';
            RAISE EXCEPTION 'enrollment target missing';
          END IF;
          IF v_active AND v_enrollment.status IN ('withdrawn', 'completed') THEN
            v_error_code := 'enrollment_reactivation_required';
            v_error_message := 'A withdrawn or completed LMS enrollment requires manual reactivation.';
            RAISE EXCEPTION 'enrollment reactivation';
          END IF;
          IF v_link.sync_hash = v_hash AND v_link.source_status = (CASE WHEN v_active THEN 'active' ELSE 'inactive' END) THEN
            v_operation := 'unchanged';
          ELSIF v_active THEN
            UPDATE public.direct_enrollments SET status = 'active', source = 'import'
            WHERE id = v_enrollment.id AND org_id = p_org_id;
            v_operation := 'update';
          ELSE
            UPDATE public.direct_enrollments SET status = 'withdrawn', source = 'import'
            WHERE id = v_enrollment.id AND org_id = p_org_id AND status NOT IN ('withdrawn', 'completed');
            v_operation := 'deactivate';
          END IF;
        END IF;
        IF v_operation <> 'unchanged' OR v_link.id IS NOT NULL THEN
          INSERT INTO public.external_entity_links(
            org_id, connection_id, source_system, source_tenant_id, object_type,
            sourced_id, sourced_id_hash, local_table, local_id, source_status, sync_hash
          ) VALUES (
            p_org_id, v_job.connection_id, v_job.source_system, v_job.source_tenant_id, 'enrollment',
            v_row.sourced_id, encode(digest(v_row.sourced_id, 'sha256'), 'hex'), 'direct_enrollments', v_enrollment.id,
            CASE WHEN v_active THEN 'active' ELSE 'inactive' END, v_hash
          )
          ON CONFLICT (org_id, source_system, object_type, sourced_id) DO UPDATE SET
            source_status = EXCLUDED.source_status, sync_hash = EXCLUDED.sync_hash,
            local_id = EXCLUDED.local_id, last_seen_at = now(), updated_at = now();
        END IF;
      END IF;

      UPDATE public.oneroster_import_rows SET operation = v_operation,
        status = CASE WHEN v_operation = 'unchanged' THEN 'skipped' ELSE 'applied' END,
        error_code = NULL, error_message = NULL
      WHERE id = v_row.id AND org_id = p_org_id;
      v_quarantined := v_quarantined - 1;
      IF v_operation = 'create' THEN v_created := v_created + 1;
      ELSIF v_operation = 'update' THEN v_updated := v_updated + 1;
      ELSIF v_operation = 'deactivate' THEN v_deactivated := v_deactivated + 1;
      ELSE v_unchanged := v_unchanged + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.oneroster_import_rows SET operation = 'quarantine', status = 'quarantined',
        error_code = v_error_code, error_message = v_error_message
      WHERE id = v_row.id AND org_id = p_org_id;
    END;
  END LOOP;

  v_status := CASE WHEN v_quarantined > 0 THEN 'failed' ELSE 'applied' END;
  UPDATE public.oneroster_import_jobs SET status = v_status, completed_at = now(),
    created_count = v_created, updated_count = v_updated, unchanged_count = v_unchanged,
    deactivated_count = v_deactivated, quarantined_count = v_quarantined,
    error_count = v_quarantined, error_summary = jsonb_build_object('quarantined', v_quarantined)
  WHERE id = p_job_id AND org_id = p_org_id;

  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, org_id, metadata)
  VALUES (p_actor_auth_id, 'oneroster_identity_apply', 'oneroster_import_job', p_job_id, p_org_id,
    jsonb_build_object('created_count', v_created, 'updated_count', v_updated,
      'unchanged_count', v_unchanged, 'deactivated_count', v_deactivated, 'quarantined_count', v_quarantined));

  RETURN jsonb_build_object('success', true, 'status', v_status, 'created', v_created,
    'updated', v_updated, 'unchanged', v_unchanged, 'deactivated', v_deactivated,
    'quarantined', v_quarantined);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_oneroster_job(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_oneroster_job(uuid, uuid, uuid, uuid) TO service_role;
