BEGIN;
SELECT plan(13);
\ir helpers/fixtures.inc
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor('admin');
SELECT lives_ok($$UPDATE section_groups SET max_members=1 WHERE id=pg_temp.fixture_id('group-a')$$,
  'limit may equal the current count');
SELECT throws_ok($$INSERT INTO section_group_members(group_id,org_id,user_id)
  VALUES(pg_temp.fixture_id('group-a'),pg_temp.fixture_id('org-a'),pg_temp.fixture_id('nonmember-auth'))$$,
  'PCC01',NULL,'authenticated direct insert cannot exceed capacity');
SELECT throws_ok($$INSERT INTO section_group_members(group_id,org_id,user_id)
  VALUES(pg_temp.fixture_id('group-a'),pg_temp.fixture_id('org-a'),pg_temp.fixture_id('student-auth'))$$,
  '23505',NULL,'duplicate membership keeps the unique error');
SELECT lives_ok($$UPDATE section_group_members SET role='leader'
  WHERE group_id=pg_temp.fixture_id('group-a')$$,'role edits work at capacity');
SELECT lives_ok($$UPDATE section_groups SET max_members=2 WHERE id=pg_temp.fixture_id('group-a')$$,
  'staff can increase the limit');
SELECT lives_ok($$INSERT INTO section_group_members(group_id,org_id,user_id)
  VALUES(pg_temp.fixture_id('group-a'),pg_temp.fixture_id('org-a'),pg_temp.fixture_id('nonmember-auth'))$$,
  'available place accepts a member');
SELECT throws_ok($$UPDATE section_groups SET max_members=1 WHERE id=pg_temp.fixture_id('group-a')$$,
  'PCC01',NULL,'limit cannot be reduced below current count');
SELECT is((SELECT count(*) FROM section_group_members WHERE group_id=pg_temp.fixture_id('group-a')),
  2::bigint,'failed reduction preserves members');
INSERT INTO section_groups(id,section_id,org_id,group_name,created_by)
  VALUES(pg_temp.fixture_id('group-unlimited'),pg_temp.fixture_id('section-a'),pg_temp.fixture_id('org-a'),'Unlimited',auth.uid());
SELECT lives_ok($$INSERT INTO section_group_members(group_id,org_id,user_id)
  VALUES(pg_temp.fixture_id('group-unlimited'),pg_temp.fixture_id('org-a'),pg_temp.fixture_id('teacher-auth')),
        (pg_temp.fixture_id('group-unlimited'),pg_temp.fixture_id('org-a'),pg_temp.fixture_id('manager-auth'))$$,
  'unlimited groups accept multiple members');
SELECT throws_ok($$UPDATE section_groups SET max_members=1 WHERE id=pg_temp.fixture_id('group-unlimited')$$,
  'PCC01',NULL,'unlimited group cannot acquire an undersized limit');
SELECT throws_ok($$UPDATE section_group_members SET group_id=pg_temp.fixture_id('group-a')
  WHERE group_id=pg_temp.fixture_id('group-unlimited') AND user_id=pg_temp.fixture_id('teacher-auth')$$,
  'PCC01',NULL,'moving a member cannot overfill the destination');
DELETE FROM section_group_members WHERE group_id=pg_temp.fixture_id('group-a') AND user_id=pg_temp.fixture_id('nonmember-auth');
SELECT lives_ok($$UPDATE section_group_members SET group_id=pg_temp.fixture_id('group-a')
  WHERE group_id=pg_temp.fixture_id('group-unlimited') AND user_id=pg_temp.fixture_id('teacher-auth')$$,
  'removal frees a place for a moved member');
SELECT pg_temp.actor('admin-b');
SELECT throws_ok($$INSERT INTO section_group_members(group_id,org_id,user_id)
  VALUES(pg_temp.fixture_id('group-a'),pg_temp.fixture_id('org-b'),pg_temp.fixture_id('student-b-auth'))$$,
  '42501',NULL,'capacity trigger preserves tenant isolation');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
