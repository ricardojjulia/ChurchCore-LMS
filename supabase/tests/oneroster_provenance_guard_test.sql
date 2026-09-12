-- Fixtures and mutations roll back, including on the linked database.
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
  v_term uuid := gen_random_uuid();
  v_blueprint uuid := gen_random_uuid();
  v_section uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.organizations(id, name, slug)
    VALUES (v_org, 'OneRoster provenance test', 'oneroster-guard-' || v_org);
  INSERT INTO auth.users(id, email, raw_user_meta_data)
    VALUES (v_auth, v_auth || '@example.invalid', jsonb_build_object('org_id', v_org, 'role', 'admin'));
  SELECT uid INTO v_uid FROM public.profiles WHERE auth_id = v_auth;

  INSERT INTO public.academic_terms(id, org_id, term_name, term_code, type, start_date, end_date, created_by)
    VALUES (v_term, v_org, 'Imported term', 'GUARD-' || left(v_term::text, 8), 'semester', '2026-09-01', '2026-12-15', v_auth);
  INSERT INTO public.course_blueprints(id, org_id, course_code, title, created_by)
    VALUES (v_blueprint, v_org, 'GUARD-' || left(v_blueprint::text, 8), 'Imported course', v_auth);
  INSERT INTO public.course_sections(id, org_id, blueprint_id, term_id, section_code, delivery_format, created_by)
    VALUES (v_section, v_org, v_blueprint, v_term, 'GUARD-' || left(v_section::text, 8), 'asynchronous', v_auth);

  INSERT INTO public.external_entity_links(
    org_id, source_system, object_type, sourced_id, sourced_id_hash, local_table, local_id
  ) VALUES
    (v_org, 'oneroster', 'academic_session', 'guard-term', 'guard-term-hash', 'academic_terms', v_term),
    (v_org, 'oneroster', 'course', 'guard-course', 'guard-course-hash', 'course_blueprints', v_blueprint),
    (v_org, 'oneroster', 'class', 'guard-class', 'guard-class-hash', 'course_sections', v_section);

  PERFORM set_config('test.guard_term', v_term::text, true);
  PERFORM set_config('test.guard_blueprint', v_blueprint::text, true);
  PERFORM set_config('test.guard_section', v_section::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_auth::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.guard_externally_managed_academic_update()'::regprocedure),
  'provenance guard runs with caller privileges'
);
SELECT ok(NOT has_function_privilege('authenticated', 'public.guard_externally_managed_academic_update()', 'EXECUTE'), 'authenticated cannot invoke guard directly');

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.academic_terms SET term_name = 'Local overwrite' WHERE id = current_setting('test.guard_term')::uuid$$,
  '42501', 'Externally managed term fields cannot be edited locally',
  'admin cannot overwrite OneRoster term fields'
);
SELECT lives_ok(
  $$UPDATE public.academic_terms SET config = '{"attendance":"weekly"}' WHERE id = current_setting('test.guard_term')::uuid$$,
  'admin can enrich a OneRoster term locally'
);
SELECT throws_ok(
  $$UPDATE public.course_blueprints SET title = 'Local overwrite' WHERE id = current_setting('test.guard_blueprint')::uuid$$,
  '42501', 'Externally managed blueprint fields cannot be edited locally',
  'admin cannot overwrite OneRoster blueprint fields'
);
SELECT lives_ok(
  $$UPDATE public.course_blueprints SET description = 'LMS description', credits = 3 WHERE id = current_setting('test.guard_blueprint')::uuid$$,
  'admin can enrich a OneRoster blueprint locally'
);
SELECT throws_ok(
  $$UPDATE public.course_sections SET section_code = 'LOCAL' WHERE id = current_setting('test.guard_section')::uuid$$,
  '42501', 'Externally managed section fields cannot be edited locally',
  'admin cannot overwrite OneRoster section fields'
);
SELECT lives_ok(
  $$UPDATE public.course_sections SET enrollment_type = 'invite_only', max_enrollment = 24 WHERE id = current_setting('test.guard_section')::uuid$$,
  'admin can configure OneRoster section enrollment locally'
);

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$UPDATE public.academic_terms SET term_name = 'Source update' WHERE id = current_setting('test.guard_term')::uuid$$,
  'service role can apply authoritative source updates'
);

SET LOCAL ROLE postgres;
SELECT * FROM finish();
ROLLBACK;
