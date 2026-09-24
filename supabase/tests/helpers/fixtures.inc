-- Transaction-scoped synthetic fixtures. Auth IDs deliberately differ from domain UIDs.
CREATE OR REPLACE FUNCTION pg_temp.fixture_id(name text) RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT md5('lms-regression-' || name)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.actor(name text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.fixture_id(name || '-auth')::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.fixture_id(name || '-auth'), 'role', 'authenticated')::text, true);
END $$;
INSERT INTO public.organizations(id, name, slug) VALUES
  (pg_temp.fixture_id('org-a'), 'Regression A', 'regression-a'),
  (pg_temp.fixture_id('org-b'), 'Regression B', 'regression-b');
INSERT INTO auth.users(id, email, raw_app_meta_data)
SELECT pg_temp.fixture_id(name || '-auth'), name || '@regression.invalid',
  jsonb_build_object('org_id', pg_temp.fixture_id(org), 'role', role)
FROM (VALUES ('admin','org-a','admin'), ('manager','org-a','manager'),
  ('teacher','org-a','teacher'), ('student','org-a','student'),
  ('nonmember','org-a','student'), ('admin-b','org-b','admin'),
  ('teacher-b','org-b','teacher'), ('student-b','org-b','student')) AS u(name,org,role);
UPDATE public.profiles SET uid = pg_temp.fixture_id(split_part(email,'@',1) || '-uid'), status = 'active'
WHERE email LIKE '%@regression.invalid';
SELECT pg_temp.actor('admin');
INSERT INTO public.course_blueprints(id, org_id, course_code, title, created_by)
SELECT pg_temp.fixture_id('blueprint-' || n), pg_temp.fixture_id('org-' || n),
  'REGRESSION-' || n, 'Regression ' || n, pg_temp.fixture_id(actor || '-auth')
FROM (VALUES ('a','admin'),('b','admin-b')) AS o(n,actor);
INSERT INTO public.academic_terms(id, org_id, term_name, term_code, type, start_date, end_date, created_by)
SELECT pg_temp.fixture_id('term-' || n), pg_temp.fixture_id('org-' || n),
  'Regression ' || n, 'REGRESSION-' || n, 'semester', CURRENT_DATE - 30, CURRENT_DATE + 30,
  pg_temp.fixture_id(actor || '-auth')
FROM (VALUES ('a','admin'),('b','admin-b')) AS o(n,actor);
INSERT INTO public.course_sections(id, org_id, blueprint_id, term_id, section_code, delivery_format, created_by)
SELECT pg_temp.fixture_id('section-' || n), pg_temp.fixture_id('org-' || org),
  pg_temp.fixture_id('blueprint-' || org), pg_temp.fixture_id('term-' || org),
  'REGRESSION-' || n, 'asynchronous', pg_temp.fixture_id(actor || '-auth')
FROM (VALUES ('a','a','admin'),('b','b','admin-b'),('future','a','admin')) AS s(n,org,actor);
INSERT INTO public.access_windows(section_id, org_id, start_date, end_date)
SELECT pg_temp.fixture_id('section-' || n), pg_temp.fixture_id('org-' || org),
  NOW() + start_days * INTERVAL '1 day', NOW() + INTERVAL '30 days'
FROM (VALUES ('a','a',-30),('b','b',-30),('future','a',2)) AS w(n,org,start_days);
INSERT INTO public.courses(id, org_id, title, status, owner_id, blueprint_id)
SELECT pg_temp.fixture_id('course-' || n), pg_temp.fixture_id('org-' || n),
  'Regression ' || n, 'published', pg_temp.fixture_id(actor || '-uid'), pg_temp.fixture_id('blueprint-' || n)
FROM (VALUES ('a','teacher'),('b','teacher-b')) AS c(n,actor);
INSERT INTO public.direct_enrollments(user_id, section_id, org_id, status, source, enrolled_by)
SELECT pg_temp.fixture_id(actor || '-auth'), pg_temp.fixture_id('section-' || n),
  pg_temp.fixture_id('org-' || n), 'active', 'direct', pg_temp.fixture_id(admin || '-auth')
FROM (VALUES ('a','student','admin'),('b','student-b','admin-b')) AS e(n,actor,admin);
INSERT INTO public.enrollments(user_id, course_id, org_id, transit_status, progress_percent)
SELECT pg_temp.fixture_id(actor || '-uid'), pg_temp.fixture_id('course-' || n),
  pg_temp.fixture_id('org-' || n), 'in_progress', 0
FROM (VALUES ('a','student'),('b','student-b')) AS e(n,actor)
ON CONFLICT (user_id, course_id) DO NOTHING;
INSERT INTO public.section_groups(id, section_id, org_id, group_name, created_by)
SELECT pg_temp.fixture_id('group-' || n), pg_temp.fixture_id('section-' || n),
  pg_temp.fixture_id('org-' || n), 'Regression Group ' || n, pg_temp.fixture_id(actor || '-auth')
FROM (VALUES ('a','admin'),('b','admin-b')) AS g(n,actor);
INSERT INTO public.section_group_members(group_id, user_id, org_id)
SELECT pg_temp.fixture_id('group-' || n), pg_temp.fixture_id(actor || '-auth'), pg_temp.fixture_id('org-' || n)
FROM (VALUES ('a','student'),('b','student-b')) AS m(n,actor);
INSERT INTO public.group_threads(id, group_id, org_id, title, created_by)
SELECT pg_temp.fixture_id('thread-' || n), pg_temp.fixture_id('group-' || n),
  pg_temp.fixture_id('org-' || n), 'Regression Thread ' || n, pg_temp.fixture_id(actor || '-auth')
FROM (VALUES ('a','student'),('b','student-b')) AS t(n,actor);
INSERT INTO public.group_posts(id, thread_id, group_id, org_id, author_id, body)
SELECT pg_temp.fixture_id('post-' || n), pg_temp.fixture_id('thread-' || n), pg_temp.fixture_id('group-' || n),
  pg_temp.fixture_id('org-' || n), pg_temp.fixture_id(actor || '-auth'), 'Regression post ' || n
FROM (VALUES ('a','student'),('b','student-b')) AS p(n,actor);
INSERT INTO public.content_pages(id, course_id, org_id, title, body, format_version, status, created_by)
SELECT pg_temp.fixture_id('page-' || n), pg_temp.fixture_id('course-' || n), pg_temp.fixture_id('org-' || n),
  'Regression page ' || n, '{"type":"doc","content":[]}', 'tiptap-v2', 'published', pg_temp.fixture_id(actor || '-uid')
FROM (VALUES ('a','teacher'),('b','teacher-b')) AS p(n,actor);
INSERT INTO public.embeddings(id, org_id, source_type, source_id, chunk_index, chunk_text, chunk_char_count,
  embedding, section_id, source_updated_at, is_active)
SELECT pg_temp.fixture_id('chunk-' || n), pg_temp.fixture_id('org-' || org), 'content_page',
  pg_temp.fixture_id('page-' || org), idx, 'Regression chunk ' || n, 18,
  array_fill(1,ARRAY[1536])::vector, pg_temp.fixture_id('section-' || org), NOW(), active
FROM (VALUES ('a','a',0,true),('a-related','a',1,true),('a-inactive','a',2,false),('b','b',0,true)) AS e(n,org,idx,active);
