-- pgTAP tests for Phase 2: Section Groups (ADR-2025-002)
-- Run with: supabase test db

BEGIN;
SELECT plan(30);
\ir helpers/fixtures.inc

-- ============================================================
-- TABLE EXISTENCE
-- ============================================================
SELECT has_table('public', 'section_groups',        'section_groups table exists');
SELECT has_table('public', 'section_group_members', 'section_group_members table exists');
SELECT has_table('public', 'group_threads',          'group_threads table exists');
SELECT has_table('public', 'group_posts',            'group_posts table exists');

-- ============================================================
-- TIMESTAMPTZ columns
-- ============================================================
SELECT col_type_is('public', 'section_group_members', 'joined_at',   'timestamp with time zone', 'section_group_members.joined_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'group_threads',         'created_at',  'timestamp with time zone', 'group_threads.created_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'group_threads',         'updated_at',  'timestamp with time zone', 'group_threads.updated_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'group_posts',           'created_at',  'timestamp with time zone', 'group_posts.created_at is TIMESTAMPTZ');
SELECT col_type_is('public', 'group_posts',           'updated_at',  'timestamp with time zone', 'group_posts.updated_at is TIMESTAMPTZ');

-- ============================================================
-- UNIQUE CONSTRAINTS
-- ============================================================
SELECT col_is_unique('public', 'section_groups',        ARRAY['section_id','group_name'], 'section_groups (section_id, group_name) is unique');
SELECT col_is_unique('public', 'section_group_members', ARRAY['group_id','user_id'],      'section_group_members (group_id, user_id) is unique');

-- ============================================================
-- CHECK CONSTRAINTS
-- ============================================================
SELECT throws_ok(
  $$INSERT INTO section_groups(org_id, section_id, group_name, purpose, created_by)
SELECT  public.current_user_org_id(), id, 'BadPurpose', 'homework', auth.uid() FROM course_sections LIMIT 1$$,
  '23514',
  NULL,
  'section_groups rejects invalid purpose value'
);

SELECT throws_ok(
  $$INSERT INTO section_group_members(org_id, group_id, user_id, role)
SELECT public.current_user_org_id(), id, auth.uid(), 'admin'
FROM section_groups WHERE id = pg_temp.fixture_id('group-a')$$,
  '23514',
  NULL,
  'section_group_members rejects invalid role value'
);

SELECT throws_ok(
  $$INSERT INTO group_posts(org_id, thread_id, group_id, author_id, body)
SELECT  public.current_user_org_id(), gt.id, gt.group_id, auth.uid(), '  '
    FROM group_threads gt LIMIT 1$$,
  '23514',
  NULL,
  'group_posts rejects blank body'
);

SELECT throws_ok(
  $$INSERT INTO group_threads(org_id, group_id, title, created_by)
SELECT  public.current_user_org_id(), id, '   ', auth.uid() FROM section_groups LIMIT 1$$,
  '23514',
  NULL,
  'group_threads rejects blank title'
);

-- ============================================================
-- FUNCTION EXISTENCE
-- ============================================================
SELECT has_function('public', 'is_group_member',        ARRAY['uuid'], 'is_group_member(uuid) exists');
SELECT has_function('public', 'get_my_groups',           ARRAY[]::text[], 'get_my_groups() exists');
SELECT has_function('public', 'get_group_thread_posts',  ARRAY['uuid'], 'get_group_thread_posts(uuid) exists');

-- ============================================================
-- is_group_member: returns FALSE when not a member
-- ============================================================
SELECT is(
  is_group_member(gen_random_uuid()),
  FALSE,
  'is_group_member returns FALSE for a non-existent group'
);

-- ============================================================
-- is_group_member: returns TRUE after adding current user
-- ============================================================
SAVEPOINT test_membership;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_result     BOOLEAN;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, purpose, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Test Group Alpha', 'collaboration', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(org_id, group_id, user_id, role)
VALUES ( public.current_user_org_id(), v_group_id, auth.uid(), 'member');

  v_result := is_group_member(v_group_id);
  ASSERT v_result = TRUE, 'is_group_member returns TRUE after membership insert';


END;
$$;
ROLLBACK TO SAVEPOINT test_membership;

SELECT pass('is_group_member TRUE-after-insert test passed');

-- ============================================================
-- Duplicate group member: rejected
-- ============================================================
SAVEPOINT test_dup_member;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, purpose, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Dup Test Group', 'general', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(org_id, group_id, user_id, role)
VALUES ( public.current_user_org_id(), v_group_id, auth.uid(), 'member');

  BEGIN
    INSERT INTO section_group_members(org_id, group_id, user_id, role)
VALUES ( public.current_user_org_id(), v_group_id, auth.uid(), 'leader');
    ASSERT FALSE, 'Should have raised a unique violation';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;


END;
$$;
ROLLBACK TO SAVEPOINT test_dup_member;

SELECT pass('duplicate group member is rejected test passed');

-- ============================================================
-- Duplicate group name within a section: rejected
-- ============================================================
SAVEPOINT test_dup_name;
DO $$
DECLARE
  v_section_id UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'NameConflict', auth.uid());

  BEGIN
    INSERT INTO section_groups(org_id, section_id, group_name, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'NameConflict', auth.uid());
    ASSERT FALSE, 'Should have raised a unique violation';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;


END;
$$;
ROLLBACK TO SAVEPOINT test_dup_name;

SELECT pass('duplicate group name within section is rejected test passed');

-- ============================================================
-- get_group_thread_posts: non-member raises exception
-- ============================================================
SAVEPOINT test_nonmember_access;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, purpose, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Private Group', 'grading', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO group_threads(org_id, group_id, title, created_by)
VALUES ( public.current_user_org_id(), v_group_id, 'Secret Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  PERFORM pg_temp.actor('nonmember');
  -- Current user is NOT a member — should raise exception
  BEGIN
    PERFORM get_group_thread_posts(v_thread_id);
    ASSERT FALSE, 'Non-member should not be able to read thread posts';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Not a member%' OR SQLERRM LIKE '%not a member%',
      'Raised exception should mention group membership';
  END;


END;
$$;
ROLLBACK TO SAVEPOINT test_nonmember_access;

SELECT pass('get_group_thread_posts rejects non-member access test passed');

-- ============================================================
-- get_group_thread_posts: member can read posts
-- ============================================================
SAVEPOINT test_member_read;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_row        RECORD;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, purpose, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Open Group', 'discussion', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(org_id, group_id, user_id, role)
VALUES ( public.current_user_org_id(), v_group_id, auth.uid(), 'leader');

  INSERT INTO group_threads(org_id, group_id, title, created_by)
VALUES ( public.current_user_org_id(), v_group_id, 'Our Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  INSERT INTO group_posts(org_id, thread_id, group_id, author_id, body)
VALUES ( public.current_user_org_id(), v_thread_id, v_group_id, auth.uid(), 'Hello from the group!');

  SELECT * INTO v_row FROM get_group_thread_posts(v_thread_id) LIMIT 1;
  ASSERT v_row.body = 'Hello from the group!', 'Member can read group post body';
  ASSERT v_row.is_own = TRUE, 'is_own is TRUE for the author';


END;
$$;
ROLLBACK TO SAVEPOINT test_member_read;

SELECT pass('get_group_thread_posts member read access test passed');

-- ============================================================
-- group_posts: soft-delete keeps row, hides from reader
-- ============================================================
SAVEPOINT test_soft_delete;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_post_id    UUID;
  v_count      INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Soft Delete Test Group', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(org_id, group_id, user_id)
VALUES ( public.current_user_org_id(), v_group_id, auth.uid());

  INSERT INTO group_threads(org_id, group_id, title, created_by)
VALUES ( public.current_user_org_id(), v_group_id, 'Soft Delete Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  INSERT INTO group_posts(org_id, thread_id, group_id, author_id, body)
VALUES ( public.current_user_org_id(), v_thread_id, v_group_id, auth.uid(), 'To be deleted')
  RETURNING id INTO v_post_id;

  UPDATE group_posts SET is_deleted = TRUE WHERE id = v_post_id;

  SELECT COUNT(*) INTO v_count
  FROM get_group_thread_posts(v_thread_id)
  WHERE post_id = v_post_id;

  ASSERT v_count = 0, 'Soft-deleted post is hidden from get_group_thread_posts()';

  -- But the row still exists in the table
  ASSERT EXISTS (SELECT 1 FROM group_posts WHERE id = v_post_id),
    'Soft-deleted post still exists in group_posts table';


END;
$$;
ROLLBACK TO SAVEPOINT test_soft_delete;

SELECT pass('group_posts soft-delete hides post from reader test passed');

-- ============================================================
-- updated_at trigger fires on thread update
-- ============================================================
SAVEPOINT test_trigger;
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_before     TIMESTAMPTZ;
  v_after      TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_section_id FROM course_sections WHERE id = pg_temp.fixture_id('section-a');
  ASSERT v_section_id IS NOT NULL, 'required section fixture missing';

  INSERT INTO section_groups(org_id, section_id, group_name, created_by)
VALUES ( public.current_user_org_id(), v_section_id, 'Trigger Test Group', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO group_threads(org_id, group_id, title, created_by, updated_at)
VALUES ( public.current_user_org_id(), v_group_id, 'Trigger Thread', auth.uid(), NOW() - INTERVAL '1 day')
  RETURNING id, updated_at INTO v_thread_id, v_before;



  UPDATE group_threads SET title = 'Trigger Thread Updated' WHERE id = v_thread_id;

  SELECT updated_at INTO v_after FROM group_threads WHERE id = v_thread_id;
  ASSERT v_after > v_before, 'updated_at advances on thread update';


END;
$$;
ROLLBACK TO SAVEPOINT test_trigger;

SELECT pass('group_threads updated_at trigger test passed');

-- ============================================================
-- RLS POLICIES — exact names
-- ============================================================
SELECT policies_are('public', 'section_groups', ARRAY[
  'section_groups: active tenant boundary',
  'section_groups: learners read own',
  'section_groups: staff read own org',
  'section_groups: teachers manage own org'
], 'section_groups has the expected tenant policies');

SELECT policies_are('public', 'section_group_members', ARRAY[
  'section_group_members: active tenant boundary',
  'section_group_members: learners read own',
  'section_group_members: managers manage own org',
  'section_group_members: staff read own org'
], 'section_group_members has the expected tenant policies');

SELECT policies_are('public', 'group_threads', ARRAY[
  'group_threads: active tenant boundary',
  'group_threads: members delete own own org',
  'group_threads: members insert own org',
  'group_threads: members read own org',
  'group_threads: staff read own org',
  'group_threads: teachers moderate own org'
], 'group_threads has the expected tenant policies');

SELECT policies_are('public', 'group_posts', ARRAY[
  'group_posts: active tenant boundary',
  'group_posts: authors update own org',
  'group_posts: members insert own org',
  'group_posts: members read own org',
  'group_posts: staff delete own org',
  'group_posts: staff read own org',
  'group_posts: teachers moderate own org'
], 'group_posts has the expected tenant policies');

SELECT * FROM finish();
ROLLBACK;
