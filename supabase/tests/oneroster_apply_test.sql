-- All fixtures and mutations roll back, including on the linked database.
BEGIN;
SET LOCAL ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_other_org uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_uid uuid;
BEGIN
  INSERT INTO public.organizations(id, name, slug) VALUES
    (v_org, 'OneRoster transaction test', 'oneroster-test-' || v_org),
    (v_other_org, 'OneRoster other tenant', 'oneroster-test-' || v_other_org);
  INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES
    (v_auth, v_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'admin'));
  SELECT uid INTO v_uid FROM public.profiles WHERE auth_id = v_auth;
  PERFORM set_config('test.oneroster_org', v_org::text, true);
  PERFORM set_config('test.oneroster_other_org', v_other_org::text, true);
  PERFORM set_config('test.oneroster_auth', v_auth::text, true);
  PERFORM set_config('test.oneroster_uid', v_uid::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  INSERT INTO public.oneroster_connections(org_id) VALUES (v_org), (v_other_org);
END;
$$;

CREATE FUNCTION pg_temp.stage_roster(p_rows jsonb) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_job uuid;
BEGIN
  INSERT INTO public.oneroster_import_jobs(org_id, status, package_hash, total_rows)
    VALUES (current_setting('test.oneroster_org')::uuid, 'validated', 'test', jsonb_array_length(p_rows))
    RETURNING id INTO v_job;
  INSERT INTO public.oneroster_import_rows(org_id, job_id, file_type, row_number, sourced_id, status, normalized_payload)
    SELECT current_setting('test.oneroster_org')::uuid, v_job, r->>'file', n::integer,
      r->>'sourcedId', 'valid', r->'data' FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(r, n);
  RETURN v_job;
END;
$$;

CREATE FUNCTION pg_temp.apply_roster(p_job uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.apply_oneroster_academic_job(p_job, current_setting('test.oneroster_org')::uuid,
    current_setting('test.oneroster_auth')::uuid, current_setting('test.oneroster_uid')::uuid);
$$;

SELECT ok(NOT has_function_privilege('anon', 'public.apply_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anonymous cannot call service apply');
SELECT ok(NOT has_function_privilege('authenticated', 'public.apply_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot call service apply');
SELECT ok(has_function_privilege('service_role', 'public.apply_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'service role can call apply');
SELECT ok(NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.apply_oneroster_academic_job(uuid,uuid,uuid,uuid)'::regprocedure), 'apply does not elevate database privileges');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_rows jsonb := '[
    {"file":"manifest","data":{"propertyName":"manifest.version","value":"1.2"}},
    {"file":"academicSessions","sourcedId":"term-1","data":{"title":"Test term","type":"term","startDate":"2026-09-01","endDate":"2026-12-15","status":"active"}},
    {"file":"courses","sourcedId":"course-1","data":{"title":"Test course","status":"active"}},
    {"file":"classes","sourcedId":"class-1","data":{"title":"Test class","courseSourcedId":"course-1","termSourcedIds":"term-1","status":"active"}}
  ]';
  v_job uuid;
  v_result jsonb;
  v_before integer;
BEGIN
  v_job := pg_temp.stage_roster(v_rows);
  PERFORM set_config('test.oneroster_job', v_job::text, true);
  v_result := pg_temp.apply_roster(v_job);
  ASSERT v_result->>'status' = 'applied', 'academic apply must succeed';
  ASSERT (v_result->>'created')::integer = 3, 'all three academic entities created';
  ASSERT (v_result->>'unchanged')::integer = 1, 'manifest is skipped without sourcedId';
  ASSERT (SELECT count(*) FROM public.external_entity_links WHERE org_id = current_setting('test.oneroster_org')::uuid) = 3, 'all entities have provenance';
  ASSERT pg_temp.apply_roster(v_job) ? 'error', 'same job cannot apply twice';
  v_result := pg_temp.apply_roster(pg_temp.stage_roster(v_rows));
  ASSERT (v_result->>'unchanged')::integer = 4, 're-upload is idempotent';
  ASSERT (v_result->>'created')::integer = 0, 're-upload creates no duplicates';

  v_rows := jsonb_set(v_rows, '{2,data,title}', '"Updated course"');
  v_result := pg_temp.apply_roster(pg_temp.stage_roster(v_rows));
  ASSERT (v_result->>'updated')::integer = 1, 'changed source updates only its target';
  ASSERT EXISTS (SELECT 1 FROM public.course_blueprints WHERE org_id = current_setting('test.oneroster_org')::uuid AND title = 'Updated course'), 'course update persisted';

  SELECT count(*) INTO v_before FROM public.course_blueprints WHERE org_id = current_setting('test.oneroster_org')::uuid;
  v_result := pg_temp.apply_roster(pg_temp.stage_roster('[{"file":"courses","sourcedId":"broken-link","data":{"title":"Must roll back","status":"active","dateLastModified":"not-a-timestamp"}}]'));
  ASSERT (v_result->>'quarantined')::integer = 1, 'mapping write failure quarantines row';
  ASSERT (SELECT count(*) FROM public.course_blueprints WHERE org_id = current_setting('test.oneroster_org')::uuid) = v_before, 'mapping failure rolls back target insert';

  v_result := pg_temp.apply_roster(pg_temp.stage_roster('[{"file":"courses","sourcedId":"course-1","data":{"title":"Must not stick","status":"active","dateLastModified":"invalid"}}]'));
  ASSERT (v_result->>'quarantined')::integer = 1, 'failed update is quarantined';
  ASSERT EXISTS (SELECT 1 FROM public.course_blueprints WHERE org_id = current_setting('test.oneroster_org')::uuid AND title = 'Updated course'), 'failed update preserves previous title';

  v_result := pg_temp.apply_roster(pg_temp.stage_roster('[{"file":"classes","sourcedId":"class-1","data":{"status":"tobedeleted"}}]'));
  ASSERT (v_result->>'deactivated')::integer = 1, 'sparse deletion soft-deactivates without references';
  ASSERT EXISTS (SELECT 1 FROM public.course_sections WHERE org_id = current_setting('test.oneroster_org')::uuid AND NOT is_active), 'class remains as inactive history';

  v_result := pg_temp.apply_roster(pg_temp.stage_roster('[{"file":"users","sourcedId":"user-1","data":{}}]'));
  ASSERT (v_result->>'quarantined')::integer = 1, 'identity rows remain deferred';
  ASSERT v_result->>'status' = 'failed', 'quarantine is not reported as full success';

  v_job := pg_temp.stage_roster('[]');
  UPDATE public.oneroster_import_jobs SET total_rows = 1 WHERE id = v_job;
  ASSERT pg_temp.apply_roster(v_job) ? 'error', 'incomplete staging cannot apply';
  UPDATE public.oneroster_import_jobs SET total_rows = 0, expires_at = now() - interval '1 second' WHERE id = v_job;
  ASSERT pg_temp.apply_roster(v_job) ? 'error', 'expired staging cannot apply';
  ASSERT public.apply_oneroster_academic_job(v_job, current_setting('test.oneroster_other_org')::uuid,
    current_setting('test.oneroster_auth')::uuid, current_setting('test.oneroster_uid')::uuid) ? 'error', 'actor cannot import for another org';

  v_job := pg_temp.stage_roster('[]');
  UPDATE public.oneroster_import_jobs SET org_id = current_setting('test.oneroster_other_org')::uuid WHERE id = v_job;
  ASSERT pg_temp.apply_roster(v_job) ? 'error', 'cross-tenant job id is inaccessible';

  SELECT jsonb_agg(jsonb_build_object('file', 'courses', 'sourcedId', 'large-' || i,
    'data', jsonb_build_object('title', 'Large import ' || i, 'status', 'active'))) INTO v_rows FROM generate_series(1, 1005) i;
  v_result := pg_temp.apply_roster(pg_temp.stage_roster(v_rows));
  ASSERT (v_result->>'created')::integer = 1005, 'imports over the REST row limit are complete';
END;
$$;
SET LOCAL ROLE postgres;
SELECT pass('academic apply, replay, update, soft deletion, rollback, deferred identities, staging guards and 1005-row import');

SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.oneroster_connections), 1, 'admin reads only own connections');
SELECT ok(EXISTS (SELECT 1 FROM public.oneroster_import_jobs WHERE id = current_setting('test.oneroster_job')::uuid), 'admin reads own jobs');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_jobs WHERE org_id = current_setting('test.oneroster_other_org')::uuid), 0, 'admin cannot read other tenant jobs');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_rows WHERE job_id = current_setting('test.oneroster_job')::uuid), 4, 'admin reads own staged rows');
SELECT ok(EXISTS (SELECT 1 FROM public.external_entity_links), 'admin reads own provenance');
SELECT throws_ok($$INSERT INTO public.oneroster_import_jobs(org_id, package_hash) VALUES (current_setting('test.oneroster_org')::uuid, 'forged')$$, '42501', NULL, 'admin cannot forge staged jobs');
SELECT throws_ok($$INSERT INTO public.external_entity_links(org_id, source_system, object_type, sourced_id, sourced_id_hash, local_table, local_id) VALUES (current_setting('test.oneroster_org')::uuid, 'manual', 'course', 'forged', 'hash', 'course_blueprints', gen_random_uuid())$$, '42501', NULL, 'admin cannot forge provenance');
SELECT throws_ok($$INSERT INTO public.oneroster_import_rows(org_id, job_id, file_type, row_number) VALUES (current_setting('test.oneroster_org')::uuid, current_setting('test.oneroster_job')::uuid, 'courses', 99)$$, '42501', NULL, 'admin cannot forge staging rows');
SELECT throws_ok($$INSERT INTO public.oneroster_connections(org_id) VALUES (current_setting('test.oneroster_other_org')::uuid)$$, '42501', NULL, 'admin cannot create another tenant connection');
SET LOCAL ROLE postgres;

UPDATE public.profile_roles SET role = 'student' WHERE auth_id = current_setting('test.oneroster_auth')::uuid;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.oneroster_connections), 0, 'student cannot read connections');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_jobs), 0, 'student cannot read jobs');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_rows), 0, 'student cannot read staged rows');
SELECT is((SELECT count(*)::integer FROM public.external_entity_links), 0, 'student cannot read provenance');
SET LOCAL ROLE postgres;
SELECT ok(pg_temp.apply_roster(current_setting('test.oneroster_job')::uuid) ? 'error', 'service cannot apply for student actor');

UPDATE public.profile_roles SET role = 'teacher' WHERE auth_id = current_setting('test.oneroster_auth')::uuid;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_jobs), 0, 'teacher cannot read jobs');
SELECT ok(EXISTS (SELECT 1 FROM public.external_entity_links), 'teacher can inspect own provenance');
SET LOCAL ROLE postgres;
UPDATE public.profile_roles SET role = 'manager' WHERE auth_id = current_setting('test.oneroster_auth')::uuid;
SET LOCAL ROLE authenticated;
SELECT ok(EXISTS (SELECT 1 FROM public.oneroster_import_jobs), 'manager reads own jobs');
SET LOCAL ROLE postgres;

UPDATE public.profile_roles SET role = 'admin', tenant_active = false WHERE auth_id = current_setting('test.oneroster_auth')::uuid;
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.oneroster_connections), 0, 'suspended admin cannot read connections');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_jobs), 0, 'suspended admin cannot read jobs');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_rows), 0, 'suspended admin cannot read staging');
SELECT is((SELECT count(*)::integer FROM public.external_entity_links), 0, 'suspended admin cannot read provenance');
SET LOCAL ROLE postgres;
SELECT ok(pg_temp.apply_roster(current_setting('test.oneroster_job')::uuid) ? 'error', 'service rejects suspended actor');

SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.oneroster_connections), 0, 'anonymous cannot read connections');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_jobs), 0, 'anonymous cannot read jobs');
SELECT is((SELECT count(*)::integer FROM public.oneroster_import_rows), 0, 'anonymous cannot read staging');
SELECT is((SELECT count(*)::integer FROM public.external_entity_links), 0, 'anonymous cannot read provenance');
SET LOCAL ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
