-- pgTAP tests for Phase 2: Section Groups (ADR-2025-002)
-- Run with: supabase test db

BEGIN;
SELECT plan(42);

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
  $$INSERT INTO section_groups(section_id, group_name, purpose, created_by)
    SELECT id, 'BadPurpose', 'homework', auth.uid() FROM course_sections LIMIT 1$$,
  '23514',
  NULL,
  'section_groups rejects invalid purpose value'
);

SELECT throws_ok(
  $$INSERT INTO section_group_members(group_id, user_id, role)
    SELECT id, auth.uid(), 'admin' FROM section_groups LIMIT 1$$,
  '23514',
  NULL,
  'section_group_members rejects invalid role value'
);

SELECT throws_ok(
  $$INSERT INTO group_posts(thread_id, group_id, author_id, body)
    SELECT gt.id, gt.group_id, auth.uid(), '  '
    FROM group_threads gt LIMIT 1$$,
  '23514',
  NULL,
  'group_posts rejects blank body'
);

SELECT throws_ok(
  $$INSERT INTO group_threads(group_id, title, created_by)
    SELECT id, '   ', auth.uid() FROM section_groups LIMIT 1$$,
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
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_result     BOOLEAN;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, purpose, created_by)
  VALUES (v_section_id, 'Test Group Alpha', 'collaboration', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');

  v_result := is_group_member(v_group_id);
  ASSERT v_result = TRUE, 'is_group_member returns TRUE after membership insert';

  ROLLBACK TO SAVEPOINT test_membership;
END;
$$;

SELECT pass('is_group_member TRUE-after-insert test passed');

-- ============================================================
-- Duplicate group member: rejected
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, purpose, created_by)
  VALUES (v_section_id, 'Dup Test Group', 'general', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'member');

  BEGIN
    INSERT INTO section_group_members(group_id, user_id, role)
    VALUES (v_group_id, auth.uid(), 'leader');
    ASSERT FALSE, 'Should have raised a unique violation';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  ROLLBACK TO SAVEPOINT test_dup_member;
END;
$$;

SELECT pass('duplicate group member is rejected test passed');

-- ============================================================
-- Duplicate group name within a section: rejected
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, created_by)
  VALUES (v_section_id, 'NameConflict', auth.uid());

  BEGIN
    INSERT INTO section_groups(section_id, group_name, created_by)
    VALUES (v_section_id, 'NameConflict', auth.uid());
    ASSERT FALSE, 'Should have raised a unique violation';
  EXCEPTION WHEN unique_violation THEN
    NULL; -- expected
  END;

  ROLLBACK TO SAVEPOINT test_dup_name;
END;
$$;

SELECT pass('duplicate group name within section is rejected test passed');

-- ============================================================
-- get_group_thread_posts: non-member raises exception
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, purpose, created_by)
  VALUES (v_section_id, 'Private Group', 'grading', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO group_threads(group_id, title, created_by)
  VALUES (v_group_id, 'Secret Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  -- Current user is NOT a member — should raise exception
  BEGIN
    PERFORM get_group_thread_posts(v_thread_id);
    ASSERT FALSE, 'Non-member should not be able to read thread posts';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%Not a member%' OR SQLERRM LIKE '%not a member%',
      'Raised exception should mention group membership';
  END;

  ROLLBACK TO SAVEPOINT test_nonmember_access;
END;
$$;

SELECT pass('get_group_thread_posts rejects non-member access test passed');

-- ============================================================
-- get_group_thread_posts: member can read posts
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_row        RECORD;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, purpose, created_by)
  VALUES (v_section_id, 'Open Group', 'discussion', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(group_id, user_id, role)
  VALUES (v_group_id, auth.uid(), 'leader');

  INSERT INTO group_threads(group_id, title, created_by)
  VALUES (v_group_id, 'Our Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  INSERT INTO group_posts(thread_id, group_id, author_id, body)
  VALUES (v_thread_id, v_group_id, auth.uid(), 'Hello from the group!');

  SELECT * INTO v_row FROM get_group_thread_posts(v_thread_id) LIMIT 1;
  ASSERT v_row.body = 'Hello from the group!', 'Member can read group post body';
  ASSERT v_row.is_own = TRUE, 'is_own is TRUE for the author';

  ROLLBACK TO SAVEPOINT test_member_read;
END;
$$;

SELECT pass('get_group_thread_posts member read access test passed');

-- ============================================================
-- group_posts: soft-delete keeps row, hides from reader
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_post_id    UUID;
  v_count      INTEGER;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, created_by)
  VALUES (v_section_id, 'Soft Delete Test Group', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO section_group_members(group_id, user_id)
  VALUES (v_group_id, auth.uid());

  INSERT INTO group_threads(group_id, title, created_by)
  VALUES (v_group_id, 'Soft Delete Thread', auth.uid())
  RETURNING id INTO v_thread_id;

  INSERT INTO group_posts(thread_id, group_id, author_id, body)
  VALUES (v_thread_id, v_group_id, auth.uid(), 'To be deleted')
  RETURNING id INTO v_post_id;

  UPDATE group_posts SET is_deleted = TRUE WHERE id = v_post_id;

  SELECT COUNT(*) INTO v_count
  FROM get_group_thread_posts(v_thread_id)
  WHERE post_id = v_post_id;

  ASSERT v_count = 0, 'Soft-deleted post is hidden from get_group_thread_posts()';

  -- But the row still exists in the table
  ASSERT EXISTS (SELECT 1 FROM group_posts WHERE id = v_post_id),
    'Soft-deleted post still exists in group_posts table';

  ROLLBACK TO SAVEPOINT test_soft_delete;
END;
$$;

SELECT pass('group_posts soft-delete hides post from reader test passed');

-- ============================================================
-- updated_at trigger fires on thread update
-- ============================================================
DO $$
DECLARE
  v_section_id UUID;
  v_group_id   UUID;
  v_thread_id  UUID;
  v_before     TIMESTAMPTZ;
  v_after      TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_section_id FROM course_sections LIMIT 1;
  IF v_section_id IS NULL THEN RETURN; END IF;

  INSERT INTO section_groups(section_id, group_name, created_by)
  VALUES (v_section_id, 'Trigger Test Group', auth.uid())
  RETURNING id INTO v_group_id;

  INSERT INTO group_threads(group_id, title, created_by)
  VALUES (v_group_id, 'Trigger Thread', auth.uid())
  RETURNING id, updated_at INTO v_thread_id, v_before;

  PERFORM pg_sleep(0.01);  -- ensure clock advances

  UPDATE group_threads SET title = 'Trigger Thread Updated' WHERE id = v_thread_id;

  SELECT updated_at INTO v_after FROM group_threads WHERE id = v_thread_id;
  ASSERT v_after > v_before, 'updated_at advances on thread update';

  ROLLBACK TO SAVEPOINT test_trigger;
END;
$$;

SELECT pass('group_threads updated_at trigger test passed');

-- ============================================================
-- RLS POLICIES — exact names
-- ============================================================
SELECT policies_are('public', 'section_groups', ARRAY[
  'admin_manager_all_section_groups',
  'teacher_all_section_groups',
  'learner_read_own_section_groups'
], 'section_groups has exactly the expected RLS policies');

SELECT policies_are('public', 'section_group_members', ARRAY[
  'admin_manager_all_group_members',
  'teacher_all_group_members',
  'learner_read_own_membership'
], 'section_group_members has exactly the expected RLS policies');

SELECT policies_are('public', 'group_threads', ARRAY[
  'admin_manager_all_group_threads',
  'teacher_all_group_threads',
  'group_member_read_threads',
  'group_member_insert_threads',
  'group_member_delete_own_thread',
  'teacher_update_thread_flags'
], 'group_threads has exactly the expected RLS policies');

SELECT policies_are('public', 'group_posts', ARRAY[
  'admin_manager_all_group_posts',
  'teacher_all_group_posts',
  'group_member_read_posts',
  'group_member_insert_posts',
  'author_update_own_post'
], 'group_posts has exactly the expected RLS policies');

SELECT * FROM finish();
ROLLBACK;
