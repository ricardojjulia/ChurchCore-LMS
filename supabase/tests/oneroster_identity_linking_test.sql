-- Fixtures and mutations roll back, including on the linked database.
BEGIN;
SET LOCAL ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();
SELECT ok(true, 'identity linking transaction assertions execute');
SELECT ok(has_function_privilege('service_role', 'public.link_oneroster_user(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE'), 'service role can link roster users');
SELECT ok(NOT has_function_privilege('authenticated', 'public.link_oneroster_user(uuid,uuid,text,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot link roster users directly');

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_admin_auth uuid := gen_random_uuid();
  v_student_auth uuid := gen_random_uuid();
  v_other_auth uuid := gen_random_uuid();
  v_admin_uid uuid;
  v_student_uid uuid;
  v_other_uid uuid;
  v_term uuid := gen_random_uuid();
  v_blueprint uuid := gen_random_uuid();
  v_section uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations(id, name, slug)
    VALUES
      (v_org, 'OneRoster identity test', 'oneroster-identity-' || v_org),
      (v_other_org, 'OneRoster other org', 'oneroster-identity-other-' || v_other_org);
  INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES
      (v_admin_auth, v_admin_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'admin')),
      (v_student_auth, v_student_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'student')),
      (v_other_auth, v_other_auth || '@example.invalid', jsonb_build_object('org_id', v_other_org, 'role', 'student'));
  SELECT uid INTO v_admin_uid FROM public.profiles WHERE auth_id = v_admin_auth;
  SELECT uid INTO v_student_uid FROM public.profiles WHERE auth_id = v_student_auth;
  SELECT uid INTO v_other_uid FROM public.profiles WHERE auth_id = v_other_auth;

  INSERT INTO public.academic_terms(id, org_id, term_name, term_code, type, start_date, end_date, created_by)
    VALUES (v_term, v_org, 'Identity term', 'IDENTITY-' || left(v_term::text, 8), 'semester', '2026-09-01', '2026-12-15', v_admin_auth);
  INSERT INTO public.course_blueprints(id, org_id, course_code, title, created_by)
    VALUES (v_blueprint, v_org, 'IDENTITY-' || left(v_blueprint::text, 8), 'Identity course', v_admin_auth);
  INSERT INTO public.course_sections(id, org_id, blueprint_id, term_id, section_code, delivery_format, enrollment_type, created_by)
    VALUES (v_section, v_org, v_blueprint, v_term, 'IDENTITY-' || left(v_section::text, 8), 'asynchronous', 'invite_only', v_admin_auth);
  INSERT INTO public.external_entity_links(
    org_id, source_system, object_type, sourced_id, sourced_id_hash, local_table, local_id
  ) VALUES (
    v_org, 'manual', 'class', 'class-identity', 'class-identity-hash', 'course_sections', v_section
  );

  PERFORM set_config('test.identity_org', v_org::text, true);
  PERFORM set_config('test.identity_other_org', v_other_org::text, true);
  PERFORM set_config('test.identity_admin_auth', v_admin_auth::text, true);
  PERFORM set_config('test.identity_admin_uid', v_admin_uid::text, true);
  PERFORM set_config('test.identity_student_uid', v_student_uid::text, true);
  PERFORM set_config('test.identity_other_uid', v_other_uid::text, true);
END;
$$;

CREATE FUNCTION pg_temp.stage_identity(p_rows jsonb)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_job uuid;
BEGIN
  INSERT INTO public.oneroster_import_jobs(org_id, status, package_hash, total_rows, source_system)
    VALUES (current_setting('test.identity_org')::uuid, 'validated', gen_random_uuid()::text, jsonb_array_length(p_rows), 'manual')
    RETURNING id INTO v_job;
  INSERT INTO public.oneroster_import_rows(org_id, job_id, file_type, row_number, sourced_id, status, normalized_payload)
    SELECT current_setting('test.identity_org')::uuid, v_job, r->>'file', n::integer,
      r->>'sourcedId', 'valid', r->'data'
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(r, n);
  RETURN v_job;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_job uuid;
  v_result jsonb;
BEGIN
  v_job := pg_temp.stage_identity('[
    {"file":"manifest","data":{"propertyName":"manifest.version","value":"1.0"}},
    {"file":"users","sourcedId":"user-identity","data":{"status":"active","enabledUser":"true"}},
    {"file":"roles","sourcedId":"role-identity","data":{"status":"active","userSourcedId":"user-identity","role":"student"}},
    {"file":"enrollments","sourcedId":"enrollment-identity","data":{"status":"active","classSourcedId":"class-identity","userSourcedId":"user-identity","role":"student"}}
  ]');

  v_result := public.preview_oneroster_job(
    v_job, current_setting('test.identity_org')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT (v_result->>'quarantined')::integer = 3, 'unlinked identity rows preview as quarantined';
  ASSERT (SELECT error_code FROM public.oneroster_import_rows WHERE job_id = v_job AND file_type = 'users') = 'identity_linking_required', 'preview explains missing user link';

  v_result := public.link_oneroster_user(
    v_job, current_setting('test.identity_org')::uuid, 'user-identity',
    current_setting('test.identity_student_uid')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT v_result->>'success' = 'true', 'admin can link roster user to existing profile';

  v_result := public.preview_oneroster_job(
    v_job, current_setting('test.identity_org')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT (v_result->>'created')::integer = 2, 'linked role and enrollment preview as creates';
  ASSERT (v_result->>'unchanged')::integer = 2, 'linked user and manifest preview as unchanged';
  ASSERT (v_result->>'quarantined')::integer = 0, 'linked identity package has no quarantine';

  v_result := public.apply_oneroster_job(
    v_job, current_setting('test.identity_org')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT v_result->>'status' = 'applied', 'linked identity package applies';
  ASSERT (v_result->>'created')::integer = 2, 'apply creates role and enrollment';
  ASSERT (v_result->>'unchanged')::integer = 2, 'apply preserves linked user and manifest counts';
  ASSERT EXISTS (
    SELECT 1 FROM public.external_entity_links
    WHERE org_id = current_setting('test.identity_org')::uuid
      AND source_system = 'manual' AND object_type = 'user' AND sourced_id = 'user-identity'
      AND local_table = 'profiles' AND local_id = current_setting('test.identity_student_uid')::uuid
  ), 'user provenance link is stored';
  ASSERT EXISTS (
    SELECT 1 FROM public.external_entity_links
    WHERE org_id = current_setting('test.identity_org')::uuid
      AND source_system = 'manual' AND object_type = 'role' AND sourced_id = 'role-identity'
      AND local_table = 'profile_roles'
  ), 'role provenance link is stored';
  ASSERT EXISTS (
    SELECT 1 FROM public.direct_enrollments
    WHERE org_id = current_setting('test.identity_org')::uuid
      AND user_id = (SELECT auth_id FROM public.profiles WHERE uid = current_setting('test.identity_student_uid')::uuid)
      AND section_id = (SELECT local_id FROM public.external_entity_links WHERE org_id = current_setting('test.identity_org')::uuid AND object_type = 'class' AND sourced_id = 'class-identity')
      AND status = 'active' AND source = 'import'
  ), 'linked student receives an active direct enrollment';

  v_job := pg_temp.stage_identity('[
    {"file":"manifest","data":{"propertyName":"manifest.version","value":"1.0"}},
    {"file":"roles","sourcedId":"role-admin","data":{"status":"active","userSourcedId":"user-identity","role":"administrator"}}
  ]');
  v_result := public.preview_oneroster_job(
    v_job, current_setting('test.identity_org')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT (v_result->>'quarantined')::integer = 1, 'administrator role stays quarantined';
  ASSERT (SELECT error_code FROM public.oneroster_import_rows WHERE job_id = v_job AND file_type = 'roles') = 'role_requires_approval', 'privileged roster role has explicit reason';
  v_result := public.apply_oneroster_job(
    v_job, current_setting('test.identity_org')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT v_result->>'status' = 'failed', 'privileged role cannot apply';
  ASSERT (SELECT role::text FROM public.profiles WHERE uid = current_setting('test.identity_student_uid')::uuid) = 'student', 'privileged role cannot escalate LMS profile';

  v_job := pg_temp.stage_identity('[
    {"file":"users","sourcedId":"user-cross-tenant","data":{"status":"active","enabledUser":"true"}}
  ]');
  v_result := public.link_oneroster_user(
    v_job, current_setting('test.identity_org')::uuid, 'user-cross-tenant',
    current_setting('test.identity_other_uid')::uuid,
    current_setting('test.identity_admin_auth')::uuid,
    current_setting('test.identity_admin_uid')::uuid
  );
  ASSERT v_result->>'error' = 'Target LMS profile is not available in this organization', 'cross-tenant profile cannot be linked';
END;
$$;

SET LOCAL ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
