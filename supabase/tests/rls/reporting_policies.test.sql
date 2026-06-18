-- pgTAP RLS Policy Tests: Reporting Feature
-- ADR: ADR-2025-012 | Council Review: CR-2025-007
-- Run: supabase test db
-- Coverage: SEC-RPT-01 through SEC-RPT-08

BEGIN;

SELECT plan(13);

-- Fixtures use this repo's identity spine:
-- auth.users.id -> profiles.auth_id, LMS records -> profiles.uid.

INSERT INTO public.organizations (id, name, slug)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Reporting Test Org A', 'reporting-test-org-a'),
  ('10000000-0000-4000-8000-000000000002', 'Reporting Test Org B', 'reporting-test-org-b')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'student-a@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'instructor-a@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin-a@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'student-b@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'admin-b@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('20000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'instructor-b@example.test', 'test-password', NOW(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (uid, auth_id, display_name, email, role, status, org_id, current_level)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Student A', 'student-a@example.test', 'student', 'active', '10000000-0000-4000-8000-000000000001', 1),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'Instructor A', 'instructor-a@example.test', 'teacher', 'active', '10000000-0000-4000-8000-000000000001', 1),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'Admin A', 'admin-a@example.test', 'admin', 'active', '10000000-0000-4000-8000-000000000001', 1),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'Student B', 'student-b@example.test', 'student', 'active', '10000000-0000-4000-8000-000000000002', 1),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000005', 'Admin B', 'admin-b@example.test', 'admin', 'active', '10000000-0000-4000-8000-000000000002', 1),
  ('30000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'Instructor B', 'instructor-b@example.test', 'teacher', 'active', '10000000-0000-4000-8000-000000000001', 1)
ON CONFLICT (auth_id) DO UPDATE SET
  uid = EXCLUDED.uid,
  display_name = EXCLUDED.display_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  status = EXCLUDED.status,
  org_id = EXCLUDED.org_id,
  current_level = EXCLUDED.current_level;

UPDATE public.profile_roles pr
SET role = p.role,
    status = p.status,
    current_level = p.current_level,
    org_id = p.org_id
FROM public.profiles p
WHERE pr.auth_id = p.auth_id;

INSERT INTO public.courses (id, title, description, owner_id, org_id, status, min_required_level)
VALUES
  ('40000000-0000-4000-8000-000000000001', 'Instructor A Reporting Course', 'Fixture course taught by instructor A.', '30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'published', 1),
  ('40000000-0000-4000-8000-000000000002', 'Instructor B Reporting Course', 'Fixture course taught by instructor B.', '30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'published', 1),
  ('40000000-0000-4000-8000-000000000003', 'Org B Reporting Course', 'Fixture course in org B.', '30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', 'published', 1)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  owner_id = EXCLUDED.owner_id,
  org_id = EXCLUDED.org_id,
  status = EXCLUDED.status;

INSERT INTO public.enrollments (user_id, course_id, transit_status, progress_percent)
VALUES
  ('30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'in_progress', 25.00),
  ('30000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000003', 'in_progress', 40.00)
ON CONFLICT (user_id, course_id) DO UPDATE SET
  transit_status = EXCLUDED.transit_status,
  progress_percent = EXCLUDED.progress_percent;

INSERT INTO public.report_definitions (id, org_id, created_by, name, report_type, config)
VALUES
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Instructor A Gradebook', 'gradebook', '{"course_id":"40000000-0000-4000-8000-000000000001"}'::jsonb),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', 'Instructor B Gradebook', 'gradebook', '{"course_id":"40000000-0000-4000-8000-000000000002"}'::jsonb),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'Org B Completion', 'completion', '{"course_id":"40000000-0000-4000-8000-000000000003"}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  created_by = EXCLUDED.created_by,
  name = EXCLUDED.name,
  report_type = EXCLUDED.report_type,
  config = EXCLUDED.config;

INSERT INTO public.report_artifacts (id, report_definition_id, org_id, generated_by, format, generation_status, row_count)
VALUES
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000005', 'pdf', 'complete', 12)
ON CONFLICT (id) DO UPDATE SET
  report_definition_id = EXCLUDED.report_definition_id,
  org_id = EXCLUDED.org_id,
  generated_by = EXCLUDED.generated_by,
  format = EXCLUDED.format,
  generation_status = EXCLUDED.generation_status,
  row_count = EXCLUDED.row_count;

INSERT INTO public.analytics_events (id, org_id, user_id, course_id, event_type, metadata)
VALUES
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000002', 'module_view', '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  user_id = EXCLUDED.user_id,
  course_id = EXCLUDED.course_id,
  event_type = EXCLUDED.event_type,
  metadata = EXCLUDED.metadata;

INSERT INTO public.report_audit_log (id, org_id, actor_id, actor_role, actor_email, action, resource_type, resource_id, target_course_id)
VALUES
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'teacher', 'instructor-a@example.test', 'report_viewed', 'report_definition', '50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001');

REFRESH MATERIALIZED VIEW public.mv_course_completion_rates;
REFRESH MATERIALIZED VIEW public.mv_gradebook_summary;

CREATE OR REPLACE FUNCTION auth_as(p_auth_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_auth_id::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- SEC-RPT-01: Cross-org data isolation.
SET LOCAL ROLE authenticated;
SELECT auth_as('20000000-0000-4000-8000-000000000001');

SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.report_definitions WHERE org_id = '10000000-0000-4000-8000-000000000002' $$,
  ARRAY[0],
  'SEC-RPT-01: student_a cannot read report definitions from org_b'
);

-- SEC-RPT-02: Role enforcement on report creation.
SELECT throws_ok(
  $$
    INSERT INTO public.report_definitions (org_id, created_by, name, report_type, config)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Student-created report', 'completion', '{}')
  $$,
  '42501',
  NULL,
  'SEC-RPT-02: student_a cannot create report definitions'
);

-- SEC-RPT-03: Analytics event spoofing prevention.
SELECT throws_ok(
  $$
    INSERT INTO public.analytics_events (org_id, user_id, course_id, event_type, metadata)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'module_view', '{}')
  $$,
  '42501',
  NULL,
  'SEC-RPT-03: student_a cannot insert analytics for a course they are not enrolled in'
);

-- SEC-RPT-04: Report artifact cross-org isolation.
SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.report_artifacts WHERE org_id = '10000000-0000-4000-8000-000000000002' $$,
  ARRAY[0],
  'SEC-RPT-04: student_a cannot see org_b report artifacts'
);

-- SEC-RPT-05: Instructor cannot read another instructor's reports.
SELECT auth_as('20000000-0000-4000-8000-000000000002');

SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.report_definitions WHERE created_by = '30000000-0000-4000-8000-000000000006' $$,
  ARRAY[0],
  'SEC-RPT-05: instructor_a cannot read instructor_b report definitions'
);

-- SEC-RPT-06: Materialized view function role guard.
SELECT auth_as('20000000-0000-4000-8000-000000000001');

SELECT throws_ok(
  $$ SELECT * FROM public.get_course_completion_rates('10000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'Insufficient role',
  'SEC-RPT-06: student_a cannot call completion-rate reporting function'
);

-- SEC-RPT-07: report_audit_log direct INSERT blocked.
SELECT throws_ok(
  $$
    INSERT INTO public.report_audit_log (org_id, actor_id, actor_role, actor_email, action, resource_type)
    VALUES ('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'student', 'student-a@example.test', 'report_viewed', 'analytics_dashboard')
  $$,
  '42501',
  NULL,
  'SEC-RPT-07: student_a cannot directly insert report audit log rows'
);

-- SEC-RPT-08: Instructor cannot read grades for a course they do not teach.
SELECT auth_as('20000000-0000-4000-8000-000000000002');

SELECT throws_ok(
  $$ SELECT * FROM public.get_gradebook_summary('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002') $$,
  'P0001',
  'Access denied',
  'SEC-RPT-08: instructor_a cannot read gradebook for instructor_b course'
);

-- Positive tests.
SELECT auth_as('20000000-0000-4000-8000-000000000003');

SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.report_definitions WHERE org_id = '10000000-0000-4000-8000-000000000001' $$,
  ARRAY[2],
  'admin_a can read all report definitions in org_a'
);

SELECT auth_as('20000000-0000-4000-8000-000000000002');

SELECT lives_ok(
  $$
    INSERT INTO public.report_definitions (id, org_id, created_by, name, report_type, config)
    VALUES ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Instructor A Completion', 'completion', '{}')
  $$,
  'instructor_a can insert a report definition in org_a'
);

SELECT auth_as('20000000-0000-4000-8000-000000000001');

SELECT lives_ok(
  $$
    INSERT INTO public.analytics_events (id, org_id, user_id, course_id, event_type, metadata)
    VALUES ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'module_view', '{}')
  $$,
  'student_a can insert analytics for an enrolled course'
);

SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.analytics_events WHERE user_id = '30000000-0000-4000-8000-000000000001' $$,
  ARRAY[1],
  'student_a can select their own analytics events'
);

SELECT results_eq(
  $$ SELECT COUNT(*)::INTEGER FROM public.analytics_events WHERE user_id = '30000000-0000-4000-8000-000000000006' $$,
  ARRAY[0],
  'student_a cannot select other students analytics events'
);

SELECT finish();
ROLLBACK;
