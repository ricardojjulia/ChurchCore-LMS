-- COUNCIL-2026-020: role, tenant, identity and suspended-tenant regressions.
BEGIN;
SELECT plan(28);
\ir helpers/fixtures.inc
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('admin');
SELECT is((SELECT count(*) FROM content_pages WHERE org_id=pg_temp.fixture_id('org-b')),0::bigint,'admin cannot read foreign content');
SELECT results_eq($$UPDATE content_pages SET title='tampered' WHERE id=pg_temp.fixture_id('page-b') RETURNING id$$,
 ARRAY[]::uuid[],'admin cannot edit foreign content');
SELECT is((SELECT count(*) FROM content_pages WHERE id=pg_temp.fixture_id('page-a')),1::bigint,'admin reads own content');
SELECT is((SELECT count(*) FROM embeddings WHERE org_id=pg_temp.fixture_id('org-b')),0::bigint,'admin cannot read foreign embeddings');
SELECT is((SELECT count(*) FROM find_related_concepts(pg_temp.fixture_id('chunk-a'),5)),1::bigint,'related concepts returns active same-tenant data');
SELECT throws_ok($$SELECT * FROM find_related_concepts(pg_temp.fixture_id('chunk-b'),5)$$,
 'P0001','Source chunk not found','related concepts rejects foreign source');
SELECT throws_ok($$SELECT * FROM get_group_thread_posts(pg_temp.fixture_id('thread-b'))$$,
 'P0001','Thread not found','staff cannot read foreign discussion');
SELECT pg_temp.actor('teacher');
SELECT is((SELECT count(*) FROM content_pages WHERE org_id=pg_temp.fixture_id('org-b')),0::bigint,'teacher cannot read foreign content');
SELECT is((SELECT count(*) FROM embeddings WHERE org_id=pg_temp.fixture_id('org-b')),0::bigint,'teacher cannot read foreign embeddings');
SELECT pg_temp.actor('student');
SELECT ok(auth.uid() <> current_user_uid(),'fixture detects Auth/domain identity confusion');
SELECT ok(is_group_member(pg_temp.fixture_id('group-a')),'membership uses Auth identity');
SELECT is((SELECT count(*) FROM get_my_groups()),1::bigint,'student sees assigned group');
SELECT is((SELECT count(*) FROM get_group_thread_posts(pg_temp.fixture_id('thread-a'))),1::bigint,'member can read discussion');
SELECT ok((SELECT is_own FROM get_group_thread_posts(pg_temp.fixture_id('thread-a')) LIMIT 1),'post ownership uses Auth identity');
SELECT is((SELECT count(*) FROM content_pages WHERE id=pg_temp.fixture_id('page-a')),1::bigint,'enrolled student reads published content');
SELECT throws_ok($$INSERT INTO group_posts(org_id,thread_id,group_id,author_id,body)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('thread-a'),pg_temp.fixture_id('group-a'),pg_temp.fixture_id('admin-auth'),'spoof')$$,
 '42501',NULL,'member cannot impersonate post author');
SELECT throws_ok($$INSERT INTO group_posts(org_id,thread_id,group_id,author_id,body)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('thread-b'),pg_temp.fixture_id('group-a'),auth.uid(),'mismatch')$$,
 '42501',NULL,'member cannot bind post to foreign thread');
SELECT lives_ok($$INSERT INTO group_posts(org_id,thread_id,group_id,author_id,body)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('thread-a'),pg_temp.fixture_id('group-a'),auth.uid(),'allowed reply')$$,
 'member can post as themselves');
SELECT pg_temp.actor('nonmember');
SELECT throws_ok($$SELECT * FROM get_group_thread_posts(pg_temp.fixture_id('thread-a'))$$,
 'P0001','Not a member of this group','nonmember cannot read discussion');
SELECT is((SELECT count(*) FROM get_my_groups()),0::bigint,'nonmember has no groups');
SELECT throws_ok($$SELECT * FROM find_related_concepts(pg_temp.fixture_id('chunk-a'),5)$$,
 'P0001','find_related_concepts requires staff role','student cannot use staff concept lookup');
RESET ROLE;
UPDATE group_threads SET is_locked=TRUE WHERE id=pg_temp.fixture_id('thread-a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('student');
SELECT throws_ok($$INSERT INTO group_posts(org_id,thread_id,group_id,author_id,body)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('thread-a'),pg_temp.fixture_id('group-a'),auth.uid(),'locked')$$,
 '42501',NULL,'student cannot post to locked thread');
RESET ROLE;
UPDATE organizations SET status='suspended' WHERE id=pg_temp.fixture_id('org-a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('admin');
SELECT is((SELECT count(*) FROM content_pages),0::bigint,'suspended tenant cannot read content');
SELECT is((SELECT count(*) FROM embeddings),0::bigint,'suspended tenant cannot read embeddings');
SELECT throws_ok($$SELECT * FROM get_group_thread_posts(pg_temp.fixture_id('thread-a'))$$,
 'P0001','Access denied','suspended staff cannot read discussions');
SELECT throws_ok($$SELECT * FROM find_related_concepts(pg_temp.fixture_id('chunk-a'),5)$$,
 'P0001','find_related_concepts requires staff role','suspended staff cannot read concepts');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM get_group_thread_posts(pg_temp.fixture_id('thread-a'))$$,'42501',NULL,'anonymous discussion RPC denied');
SELECT throws_ok($$SELECT * FROM find_related_concepts(pg_temp.fixture_id('chunk-a'),5)$$,'42501',NULL,'anonymous concept RPC denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
