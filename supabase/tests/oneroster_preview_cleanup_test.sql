BEGIN;
SET LOCAL ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

DO $$
DECLARE
  v_org uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_uid uuid;
BEGIN
  INSERT INTO public.organizations(id, name, slug)
    VALUES (v_org, 'OneRoster preview test', 'oneroster-preview-' || v_org);
  INSERT INTO auth.users(id, email, raw_app_meta_data)
    VALUES (v_auth, v_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'admin'));
  SELECT uid INTO v_uid FROM public.profiles WHERE auth_id = v_auth;
  PERFORM set_config('test.oneroster_org', v_org::text, true);
  PERFORM set_config('test.oneroster_auth', v_auth::text, true);
  PERFORM set_config('test.oneroster_uid', v_uid::text, true);
END;
$$;

CREATE FUNCTION pg_temp.stage_roster(p_rows jsonb, p_status text DEFAULT 'validated')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_job uuid;
BEGIN
  INSERT INTO public.oneroster_import_jobs(org_id, status, package_hash, total_rows)
    VALUES (current_setting('test.oneroster_org')::uuid, p_status, gen_random_uuid()::text, jsonb_array_length(p_rows))
    RETURNING id INTO v_job;
  INSERT INTO public.oneroster_import_rows(org_id, job_id, file_type, row_number, sourced_id, status, normalized_payload)
    SELECT current_setting('test.oneroster_org')::uuid, v_job, r->>'file', n::integer,
      r->>'sourcedId', 'valid', r->'data'
    FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS x(r, n);
  RETURN v_job;
END;
$$;

CREATE FUNCTION pg_temp.preview_roster(p_job uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.preview_oneroster_academic_job(p_job,
    current_setting('test.oneroster_org')::uuid,
    current_setting('test.oneroster_auth')::uuid,
    current_setting('test.oneroster_uid')::uuid);
$$;

CREATE FUNCTION pg_temp.apply_roster(p_job uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.apply_oneroster_academic_job(p_job,
    current_setting('test.oneroster_org')::uuid,
    current_setting('test.oneroster_auth')::uuid,
    current_setting('test.oneroster_uid')::uuid);
$$;

SELECT ok(NOT has_function_privilege('anon', 'public.preview_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'anonymous cannot preview');
SELECT ok(NOT has_function_privilege('authenticated', 'public.preview_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'authenticated cannot preview directly');
SELECT ok(has_function_privilege('service_role', 'public.preview_oneroster_academic_job(uuid,uuid,uuid,uuid)', 'EXECUTE'), 'service role can preview');
SELECT ok(NOT has_function_privilege('service_role', 'public.purge_expired_oneroster_staging()', 'EXECUTE'), 'service role cannot purge staging');
SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    OR EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'oneroster-staging-cleanup'),
  'cleanup is scheduled when pg_cron is available'
);

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_rows jsonb := '[
    {"file":"manifest","data":{"propertyName":"manifest.version","value":"1.2"}},
    {"file":"academicSessions","sourcedId":"term-preview","data":{"title":"Preview term","type":"term","startDate":"2026-09-01","endDate":"2026-12-15","status":"active"}},
    {"file":"courses","sourcedId":"course-preview","data":{"title":"Preview course","status":"active"}},
    {"file":"classes","sourcedId":"class-preview","data":{"title":"Preview class","courseSourcedId":"course-preview","termSourcedIds":"term-preview","status":"active"}}
  ]';
  v_job uuid;
  v_result jsonb;
BEGIN
  v_job := pg_temp.stage_roster(v_rows);
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'created')::integer = 3, 'preview identifies three creates';
  ASSERT (v_result->>'unchanged')::integer = 1, 'preview identifies manifest as unchanged';
  ASSERT (SELECT count(*) FROM public.oneroster_import_rows WHERE job_id = v_job AND operation = 'create') = 3, 'preview stores row operations';
  ASSERT (pg_temp.apply_roster(v_job)->>'created')::integer = 3, 'preview does not prevent apply';

  v_job := pg_temp.stage_roster(v_rows);
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'unchanged')::integer = 4, 'repeat preview is idempotent';

  v_job := pg_temp.stage_roster('[{"file":"courses","sourcedId":"course-preview","data":{"status":"tobedeleted"}}]');
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'deactivated')::integer = 1, 'preview identifies soft deactivation';

  v_job := pg_temp.stage_roster('[{"file":"users","sourcedId":"user-preview","data":{}}]');
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'quarantined')::integer = 1, 'preview keeps identity rows quarantined';

  v_job := pg_temp.stage_roster('[
    {"file":"courses","sourcedId":"course-keep","data":{"title":"Keep course","status":"active"}},
    {"file":"courses","sourcedId":"course-omit","data":{"title":"Omit course","status":"active"}}
  ]');
  ASSERT (pg_temp.apply_roster(v_job)->>'created')::integer = 2, 'bulk fixture creates two courses';

  v_job := pg_temp.stage_roster('[
    {"file":"manifest","data":{"propertyName":"file.courses","value":"bulk"}},
    {"file":"courses","sourcedId":"course-preview","data":{"title":"Preview course","status":"active"}},
    {"file":"courses","sourcedId":"course-keep","data":{"title":"Keep course","status":"active"}}
  ]');
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'deactivated')::integer = 1, 'bulk preview deactivates omitted courses';
  ASSERT (v_result->>'unchanged')::integer = 3, 'bulk preview keeps manifest and supplied unchanged courses';
  v_result := pg_temp.apply_roster(v_job);
  ASSERT (v_result->>'deactivated')::integer = 1, 'bulk apply deactivates omitted courses';
  ASSERT EXISTS (
    SELECT 1 FROM public.course_blueprints b
    JOIN public.external_entity_links l ON l.local_id = b.id
    WHERE b.org_id = current_setting('test.oneroster_org')::uuid
      AND l.org_id = b.org_id
      AND l.object_type = 'course'
      AND l.sourced_id = 'course-omit'
      AND NOT b.is_active
      AND l.source_status = 'inactive'
  ), 'bulk omission updates target and provenance status';

  v_job := pg_temp.stage_roster('[
    {"file":"manifest","data":{"propertyName":"file.classes","value":"bulk"}}
  ]');
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'deactivated')::integer = 1, 'bulk class preview counts omitted classes';
  ASSERT (pg_temp.apply_roster(v_job)->>'deactivated')::integer = 1, 'bulk class apply deactivates omitted classes';
  ASSERT EXISTS (
    SELECT 1 FROM public.course_sections s
    JOIN public.external_entity_links l ON l.local_id = s.id
    WHERE s.org_id = current_setting('test.oneroster_org')::uuid
      AND l.object_type = 'class'
      AND l.sourced_id = 'class-preview'
      AND NOT s.is_active
      AND l.source_status = 'inactive'
  ), 'bulk class omission updates target and provenance status';

  v_job := pg_temp.stage_roster('[
    {"file":"manifest","data":{"propertyName":"file.academicSessions","value":"bulk"}}
  ]');
  v_result := pg_temp.preview_roster(v_job);
  ASSERT (v_result->>'deactivated')::integer = 1, 'bulk session preview counts omitted sessions';
  ASSERT (pg_temp.apply_roster(v_job)->>'deactivated')::integer = 1, 'bulk session apply deactivates omitted sessions';
  ASSERT EXISTS (
    SELECT 1 FROM public.academic_terms t
    JOIN public.external_entity_links l ON l.local_id = t.id
    WHERE t.org_id = current_setting('test.oneroster_org')::uuid
      AND l.object_type = 'academic_session'
      AND l.sourced_id = 'term-preview'
      AND NOT t.is_active
      AND l.source_status = 'inactive'
  ), 'bulk session omission updates target and provenance status';
END;
$$;

SET LOCAL ROLE postgres;
DO $$
DECLARE v_expired uuid; v_applying uuid;
BEGIN
  v_expired := pg_temp.stage_roster('[{"file":"courses","sourcedId":"expired","data":{}}]', 'failed');
  v_applying := pg_temp.stage_roster('[]', 'applying');
  UPDATE public.oneroster_import_jobs SET expires_at = now() - interval '1 minute'
    WHERE id IN (v_expired, v_applying);
  ASSERT public.purge_expired_oneroster_staging() = 1, 'cleanup removes one eligible expired job';
  ASSERT NOT EXISTS (SELECT 1 FROM public.oneroster_import_jobs WHERE id = v_expired), 'expired job removed';
  ASSERT NOT EXISTS (SELECT 1 FROM public.oneroster_import_rows WHERE job_id = v_expired), 'expired staged rows cascade';
  ASSERT EXISTS (SELECT 1 FROM public.oneroster_import_jobs WHERE id = v_applying), 'applying job is preserved';
END;
$$;

SELECT * FROM finish();
ROLLBACK;
