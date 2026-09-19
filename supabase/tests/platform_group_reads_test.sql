-- COUNCIL-2026-021: platform identity has established reads, not tenant writes.
BEGIN;
SELECT plan(25);
\ir helpers/fixtures.inc
INSERT INTO auth.users(id, email) VALUES
  (pg_temp.fixture_id('platform-auth'), 'platform@regression.invalid');
DELETE FROM public.profiles WHERE auth_id = pg_temp.fixture_id('platform-auth');
INSERT INTO public.platform_admins(auth_id, display_name)
VALUES (pg_temp.fixture_id('platform-auth'), 'Regression Platform Admin');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('platform');
SELECT ok(is_platform_admin(), 'actor uses the separate platform identity plane');
SELECT ok(current_user_org_id() IS NULL, 'platform actor has no tenant');
SELECT ok(current_user_role() IS NULL, 'platform actor has no tenant staff role');
SELECT is((SELECT count(*) FROM section_groups WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 2::bigint, 'platform reads groups across tenants');
SELECT is((SELECT count(*) FROM section_group_members WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 2::bigint, 'platform reads memberships across tenants');
SELECT is((SELECT count(*) FROM group_threads WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 2::bigint, 'platform reads threads across tenants');
SELECT is((SELECT count(*) FROM group_posts WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 2::bigint, 'platform reads posts across tenants');
SELECT results_eq($$UPDATE section_groups SET group_name='tampered' WHERE id=pg_temp.fixture_id('group-a') RETURNING id$$,
 ARRAY[]::uuid[], 'platform identity gains no group update grant');
SELECT results_eq($$DELETE FROM section_group_members WHERE group_id=pg_temp.fixture_id('group-a') RETURNING id$$,
 ARRAY[]::uuid[], 'platform identity gains no member removal grant');
SELECT results_eq($$UPDATE group_threads SET title='tampered' WHERE id=pg_temp.fixture_id('thread-a') RETURNING id$$,
 ARRAY[]::uuid[], 'platform identity gains no thread update grant');
SELECT results_eq($$UPDATE group_posts SET body='tampered' WHERE id=pg_temp.fixture_id('post-a') RETURNING id$$,
 ARRAY[]::uuid[], 'platform identity gains no post update grant');
SELECT throws_ok($$INSERT INTO section_groups(org_id,section_id,group_name,created_by)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('section-a'),'platform-created',auth.uid())$$,
 '42501',NULL,'platform identity gains no group creation grant');
SELECT throws_ok($$INSERT INTO section_group_members(org_id,group_id,user_id)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('group-a'),pg_temp.fixture_id('admin-auth'))$$,
 '42501',NULL,'platform identity gains no member assignment grant');
SELECT throws_ok($$INSERT INTO group_threads(org_id,group_id,title,created_by)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('group-a'),'platform-created',auth.uid())$$,
 '42501',NULL,'platform identity gains no thread creation grant');
SELECT throws_ok($$INSERT INTO group_posts(org_id,group_id,thread_id,body,author_id)
 VALUES(pg_temp.fixture_id('org-a'),pg_temp.fixture_id('group-a'),pg_temp.fixture_id('thread-a'),'platform-created',auth.uid())$$,
 '42501',NULL,'platform identity gains no post creation grant');
SELECT pg_temp.actor('admin');
SELECT is((SELECT count(*) FROM section_groups WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 1::bigint, 'tenant admin reads only own groups');
SELECT is((SELECT count(*) FROM section_group_members WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 1::bigint, 'tenant admin reads only own memberships');
SELECT is((SELECT count(*) FROM group_threads WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 1::bigint, 'tenant admin reads only own threads');
SELECT is((SELECT count(*) FROM group_posts WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 1::bigint, 'tenant admin reads only own posts');
RESET ROLE;
UPDATE organizations SET status='suspended' WHERE id=pg_temp.fixture_id('org-a');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('admin');
SELECT is((SELECT count(*) FROM section_groups WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'suspended staff cannot read groups');
SELECT is((SELECT count(*) FROM section_group_members WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'suspended staff cannot read memberships');
SELECT is((SELECT count(*) FROM group_threads WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'suspended staff cannot read threads');
SELECT is((SELECT count(*) FROM group_posts WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'suspended staff cannot read posts');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM section_groups WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'anonymous group reads remain denied');
SELECT is((SELECT count(*) FROM group_posts WHERE org_id IN (pg_temp.fixture_id('org-a'),pg_temp.fixture_id('org-b'))), 0::bigint, 'anonymous discussion reads remain denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
