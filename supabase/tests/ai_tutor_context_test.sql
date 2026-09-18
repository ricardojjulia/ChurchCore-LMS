-- Real enrollment and role boundaries for the SQL tutor context; no provider calls.
BEGIN;
SELECT plan(27);
\ir helpers/fixtures.inc
SELECT has_function('public','build_tutor_context',ARRAY['uuid','uuid'],'context function exists');
SELECT has_function('public','search_content_chunks',ARRAY['vector','uuid','integer','double precision'],'search function exists');
SELECT has_table('public','ai_query_log','query audit exists');
SELECT hasnt_column('public','ai_query_log','query_text','audit stores no plaintext queries');
SELECT has_column('public','ai_query_log','query_hash','audit stores query hashes');
SELECT ok(NOT prosecdef, proname || ' uses RLS as invoker') FROM pg_proc
WHERE oid IN ('public.build_tutor_context(uuid,uuid)'::regprocedure,
  'public.search_content_chunks(vector,uuid,integer,double precision)'::regprocedure);
SELECT function_returns('public','search_content_chunks',ARRAY['vector','uuid','integer','double precision'],
  'setof record','search returns rows');
SELECT ok(atttypmod = 1536, 'embedding model uses 1536 dimensions')
FROM pg_attribute WHERE attrelid = 'public.embeddings'::regclass AND attname = 'embedding';
SELECT trigger_is('public','content_pages','trg_content_pages_mark_stale','public', 'mark_embeddings_stale','content edits invalidate embeddings');
SELECT trigger_is('public','direct_enrollments','trg_enrollment_status_refresh','public', 'refresh_enrollments_on_status_change','enrollment changes refresh access');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');
SELECT is(build_tutor_context(auth.uid(),pg_temp.fixture_id('section-a'))->>'contextVersion','v1','enrolled student receives context');
SELECT is(build_tutor_context(auth.uid(),pg_temp.fixture_id('section-a'))->>'accessWindowOpen','true','context confirms open access');
SELECT is((SELECT count(*) FROM get_my_section_access_window(pg_temp.fixture_id('section-b'))),0::bigint,'window helper hides other tenant');
SELECT is((SELECT count(*) FROM search_content_chunks(array_fill(1,ARRAY[1536])::vector,
  pg_temp.fixture_id('section-a'),8,0.72)),2::bigint,'search returns active own-section chunks only');
SELECT is((SELECT count(*) FROM embeddings WHERE NOT is_active),0::bigint,'student cannot read inactive embeddings');
SELECT is((SELECT count(*) FROM embeddings WHERE org_id = pg_temp.fixture_id('org-b')),0::bigint,'student cannot read foreign embeddings');
SELECT throws_like($$SELECT build_tutor_context(auth.uid(),pg_temp.fixture_id('section-b'))$$,
  'No active enrollment%', 'context denies other tenant section');
SELECT throws_like($$SELECT build_tutor_context(pg_temp.fixture_id('student-b-auth'),pg_temp.fixture_id('section-b'))$$,
  'No active enrollment%', 'context denies spoofed user');
SELECT throws_like($$SELECT * FROM search_content_chunks(array_fill(1,ARRAY[1536])::vector,pg_temp.fixture_id('section-b'),8,0.72)$$,
  'Access denied to section%', 'search denies unenrolled section');
SELECT is((SELECT count(*) FROM ai_query_log),0::bigint,'student cannot read audit logs');
SELECT throws_ok($$INSERT INTO ai_query_log(org_id,user_id,section_id,context_version,query_hash,model_used)
  VALUES (pg_temp.fixture_id('org-a'),auth.uid(),pg_temp.fixture_id('section-a'),'v1',repeat('a',64),'test')$$,
  '42501',NULL,'student cannot write audit logs');
RESET ROLE;
UPDATE direct_enrollments SET status='suspended' WHERE user_id=pg_temp.fixture_id('student-auth');
SET LOCAL ROLE authenticated;
SELECT throws_like($$SELECT build_tutor_context(auth.uid(),pg_temp.fixture_id('section-a'))$$,
  'No active enrollment%', 'suspended enrollment cannot get context');
SELECT is((SELECT count(*) FROM embeddings),0::bigint,'suspension removes embedding access immediately');
RESET ROLE;
UPDATE direct_enrollments SET status='withdrawn' WHERE user_id=pg_temp.fixture_id('student-auth');
SET LOCAL ROLE authenticated;
SELECT throws_like($$SELECT build_tutor_context(auth.uid(),pg_temp.fixture_id('section-a'))$$,
  'No active enrollment%', 'withdrawn enrollment cannot get context');
RESET ROLE;
SELECT throws_ok($$INSERT INTO embedding_jobs(org_id,source_type,source_id,section_id,triggered_by,attempt_count)
  VALUES (pg_temp.fixture_id('org-a'),'content_page',gen_random_uuid(),pg_temp.fixture_id('section-a'),'migration',-1)$$,
  '23514',NULL,'negative embedding attempt count rejected');
SELECT throws_ok($$INSERT INTO embeddings(org_id,source_type,source_id,chunk_index,chunk_text,chunk_char_count,embedding,section_id,source_updated_at)
  VALUES(pg_temp.fixture_id('org-a'),'content_page',gen_random_uuid(),0,'x',0,array_fill(1,ARRAY[1536])::vector,pg_temp.fixture_id('section-a'),NOW())$$,
  '23514',NULL,'empty chunk length rejected');
SELECT * FROM finish();
ROLLBACK;
