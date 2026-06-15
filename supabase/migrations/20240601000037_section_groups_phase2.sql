-- ============================================================
-- Phase 2: Section Groups (ADR-2025-002)
-- section_groups, section_group_members,
-- group_threads, group_posts
-- ============================================================

-- ============================================================
-- SECTION GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS section_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID        NOT NULL REFERENCES course_sections(id) ON DELETE CASCADE,
  group_name  TEXT        NOT NULL,
  group_code  TEXT,
  max_members INTEGER     CHECK (max_members > 0),
  purpose     TEXT        CHECK (purpose IN (
                            'collaboration','grading','project',
                            'discussion','lab','general'
                          )),
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (section_id, group_name)
);

CREATE INDEX IF NOT EXISTS idx_section_groups_section ON section_groups(section_id);

-- ============================================================
-- SECTION GROUP MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS section_group_members (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  UUID        NOT NULL REFERENCES section_groups(id) ON DELETE CASCADE,
  user_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT        NOT NULL DEFAULT 'member'
              CHECK (role IN ('member','leader')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_sgm_group ON section_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_sgm_user  ON section_group_members(user_id);

-- ============================================================
-- GROUP MEMBERSHIP HELPER (SECURITY DEFINER — bypasses RLS on group member table)
-- Declared here, before any policy that calls it.
-- ============================================================
CREATE OR REPLACE FUNCTION is_group_member(p_group_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM section_group_members
    WHERE group_id = p_group_id
      AND user_id  = current_user_uid()
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION is_group_member(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION is_group_member(UUID) TO authenticated;

-- ============================================================
-- SECTION GROUPS — RLS
-- ============================================================
ALTER TABLE section_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_section_groups" ON section_groups
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_all_section_groups" ON section_groups
  FOR ALL
  USING (current_user_role() = 'teacher')
  WITH CHECK (current_user_role() = 'teacher');

-- Students see only groups they belong to
CREATE POLICY "learner_read_own_section_groups" ON section_groups
  FOR SELECT
  USING (
    current_user_role() IN ('student','guardian')
    AND is_group_member(id)
  );

-- ============================================================
-- SECTION GROUP MEMBERS — RLS
-- ============================================================
ALTER TABLE section_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_group_members" ON section_group_members
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_all_group_members" ON section_group_members
  FOR ALL
  USING (current_user_role() = 'teacher')
  WITH CHECK (current_user_role() = 'teacher');

-- Students see their own memberships; group leaders also see co-members
CREATE POLICY "learner_read_own_membership" ON section_group_members
  FOR SELECT
  USING (
    current_user_role() IN ('student','guardian')
    AND (
      user_id = current_user_uid()
      OR is_group_member(group_id)
    )
  );

-- ============================================================
-- get_my_groups(): returns all active groups the current user belongs to
-- ============================================================
CREATE OR REPLACE FUNCTION get_my_groups()
RETURNS TABLE (
  group_id    UUID,
  group_name  TEXT,
  group_code  TEXT,
  purpose     TEXT,
  member_role TEXT,
  section_id  UUID,
  section_code TEXT,
  blueprint_title TEXT,
  member_count BIGINT
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    sg.id,
    sg.group_name,
    sg.group_code,
    sg.purpose,
    sgm.role               AS member_role,
    sg.section_id,
    cs.section_code,
    cb.title               AS blueprint_title,
    COUNT(sgm2.id)         AS member_count
  FROM section_group_members sgm
  JOIN section_groups sg       ON sg.id        = sgm.group_id
  JOIN course_sections cs      ON cs.id        = sg.section_id
  JOIN course_blueprints cb    ON cb.id        = cs.blueprint_id
  LEFT JOIN section_group_members sgm2 ON sgm2.group_id = sg.id
  WHERE sgm.user_id = current_user_uid()
  GROUP BY sg.id, sg.group_name, sg.group_code, sg.purpose,
           sgm.role, sg.section_id, cs.section_code, cb.title
  ORDER BY cb.title, sg.group_name;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_my_groups() FROM anon, public;
GRANT  EXECUTE ON FUNCTION get_my_groups() TO authenticated;

-- ============================================================
-- GROUP DISCUSSION THREADS
-- ============================================================
CREATE TABLE IF NOT EXISTS group_threads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   UUID        NOT NULL REFERENCES section_groups(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL CHECK (length(trim(title)) > 0),
  is_pinned  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_locked  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_threads_group ON group_threads(group_id);
CREATE INDEX IF NOT EXISTS idx_group_threads_pinned ON group_threads(group_id, is_pinned DESC, created_at DESC);

ALTER TABLE group_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_group_threads" ON group_threads
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_all_group_threads" ON group_threads
  FOR ALL
  USING (current_user_role() = 'teacher')
  WITH CHECK (current_user_role() = 'teacher');

-- Group members can read and create threads; only the creator can delete their own
CREATE POLICY "group_member_read_threads" ON group_threads
  FOR SELECT
  USING (is_group_member(group_id));

CREATE POLICY "group_member_insert_threads" ON group_threads
  FOR INSERT
  WITH CHECK (
    is_group_member(group_id)
    AND created_by = current_user_uid()
  );

CREATE POLICY "group_member_delete_own_thread" ON group_threads
  FOR DELETE
  USING (created_by = current_user_uid() AND is_group_member(group_id));

-- Thread locking / pinning: only instructor roles
CREATE POLICY "teacher_update_thread_flags" ON group_threads
  FOR UPDATE
  USING (current_user_role() IN ('teacher','admin','manager'))
  WITH CHECK (current_user_role() IN ('teacher','admin','manager'));

CREATE OR REPLACE FUNCTION handle_group_threads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_group_threads_updated_at() FROM anon, public;

CREATE TRIGGER trg_group_threads_updated_at
BEFORE UPDATE ON group_threads
FOR EACH ROW EXECUTE FUNCTION handle_group_threads_updated_at();

-- ============================================================
-- GROUP DISCUSSION POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS group_posts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID        NOT NULL REFERENCES group_threads(id) ON DELETE CASCADE,
  group_id   UUID        NOT NULL REFERENCES section_groups(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body       TEXT        NOT NULL CHECK (length(trim(body)) > 0),
  is_deleted BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_posts_thread ON group_posts(thread_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_group_posts_group  ON group_posts(group_id);
CREATE INDEX IF NOT EXISTS idx_group_posts_author ON group_posts(author_id);

ALTER TABLE group_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manager_all_group_posts" ON group_posts
  FOR ALL
  USING (current_user_role() IN ('admin','manager'))
  WITH CHECK (current_user_role() IN ('admin','manager'));

CREATE POLICY "teacher_all_group_posts" ON group_posts
  FOR ALL
  USING (current_user_role() = 'teacher')
  WITH CHECK (current_user_role() = 'teacher');

-- Group members see all non-deleted posts in their groups
CREATE POLICY "group_member_read_posts" ON group_posts
  FOR SELECT
  USING (is_group_member(group_id) AND is_deleted = FALSE);

-- Group members post in their own groups; author_id must be self
CREATE POLICY "group_member_insert_posts" ON group_posts
  FOR INSERT
  WITH CHECK (
    is_group_member(group_id)
    AND author_id = current_user_uid()
  );

-- Authors can soft-delete or edit their own non-locked posts
-- (locking is checked in the application layer via the thread's is_locked field)
CREATE POLICY "author_update_own_post" ON group_posts
  FOR UPDATE
  USING (author_id = current_user_uid() AND is_group_member(group_id))
  WITH CHECK (author_id = current_user_uid());

CREATE OR REPLACE FUNCTION handle_group_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION handle_group_posts_updated_at() FROM anon, public;

CREATE TRIGGER trg_group_posts_updated_at
BEFORE UPDATE ON group_posts
FOR EACH ROW EXECUTE FUNCTION handle_group_posts_updated_at();

-- ============================================================
-- get_group_thread_posts(): safe reader enforcing group isolation
-- ============================================================
CREATE OR REPLACE FUNCTION get_group_thread_posts(p_thread_id UUID)
RETURNS TABLE (
  post_id      UUID,
  author_id    UUID,
  display_name TEXT,
  body         TEXT,
  is_own       BOOLEAN,
  created_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_group_id UUID;
  v_uid      UUID := current_user_uid();
  v_role     TEXT := current_user_role();
BEGIN
  SELECT group_id INTO v_group_id FROM group_threads WHERE id = p_thread_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;

  -- Access check: group member OR staff
  IF v_role NOT IN ('admin','manager','teacher') THEN
    IF NOT is_group_member(v_group_id) THEN
      RAISE EXCEPTION 'Not a member of this group';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    gp.id,
    gp.author_id,
    p.display_name,
    gp.body,
    (gp.author_id = v_uid) AS is_own,
    gp.created_at,
    gp.updated_at
  FROM group_posts gp
  JOIN profiles p ON p.uid = gp.author_id
  WHERE gp.thread_id  = p_thread_id
    AND gp.is_deleted = FALSE
  ORDER BY gp.created_at ASC;
END;
$$;
REVOKE EXECUTE ON FUNCTION get_group_thread_posts(UUID) FROM anon, public;
GRANT  EXECUTE ON FUNCTION get_group_thread_posts(UUID) TO authenticated;
