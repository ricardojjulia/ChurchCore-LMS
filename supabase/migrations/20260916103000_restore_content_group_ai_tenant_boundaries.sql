-- COUNCIL-2026-020. Forward-only repairs; no stored content is rewritten.
DROP POLICY IF EXISTS "content_pages: admin/manager full access" ON public.content_pages;
DROP POLICY IF EXISTS "content_pages: teacher manages own" ON public.content_pages;
DROP POLICY IF EXISTS "staff_read_embeddings" ON public.embeddings;

DROP POLICY IF EXISTS "content_pages: tenant boundary" ON public.content_pages;
CREATE POLICY "content_pages: tenant boundary" ON public.content_pages
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()))
WITH CHECK (public.is_platform_admin() OR
  (public.current_user_tenant_active() AND org_id = public.current_user_org_id()));

DROP POLICY IF EXISTS "embeddings: tenant boundary" ON public.embeddings;
CREATE POLICY "embeddings: tenant boundary" ON public.embeddings
AS RESTRICTIVE FOR ALL TO authenticated
USING (public.current_user_tenant_active() AND org_id = public.current_user_org_id())
WITH CHECK (public.current_user_tenant_active() AND org_id = public.current_user_org_id());
DROP POLICY IF EXISTS "embeddings: enrolled students read own org" ON public.embeddings;
CREATE POLICY "embeddings: enrolled students read own org" ON public.embeddings
FOR SELECT TO authenticated USING (
  org_id = public.current_user_org_id() AND is_active
  AND public.check_section_access(public.current_user_uid(), section_id)
);

CREATE OR REPLACE FUNCTION public.tiptap_json_to_text(doc jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    string_agg(leaf->>'text', ' '),
    ''
  )
  FROM jsonb_path_query(doc, 'strict $.** ? (@.type == "text")') AS leaf
  WHERE (leaf->>'text') IS NOT NULL
    AND (leaf->>'text') <> ''
$function$;

CREATE OR REPLACE FUNCTION public.is_group_member(p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM section_group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND org_id = current_user_org_id()
      AND current_user_tenant_active()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_groups()
 RETURNS TABLE(group_id uuid, group_name text, group_code text, purpose text, member_role text, section_id uuid, section_code text, blueprint_title text, member_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  LEFT JOIN section_group_members sgm2 ON sgm2.group_id = sg.id AND sgm2.org_id = sg.org_id
  WHERE sgm.user_id = auth.uid()
    AND current_user_tenant_active()
    AND sgm.org_id = current_user_org_id()
    AND sg.org_id = sgm.org_id AND cs.org_id = sg.org_id AND cb.org_id = sg.org_id
  GROUP BY sg.id, sg.group_name, sg.group_code, sg.purpose,
           sgm.role, sg.section_id, cs.section_code, cb.title
  ORDER BY cb.title, sg.group_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_group_thread_posts(p_thread_id uuid)
 RETURNS TABLE(post_id uuid, author_id uuid, display_name text, body text, is_own boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group_id UUID;
  v_uid      UUID := auth.uid();
  v_role     TEXT := current_user_role();
BEGIN
  IF current_user_uid() IS NULL OR NOT COALESCE(current_user_tenant_active(), FALSE) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  SELECT group_id INTO v_group_id FROM group_threads WHERE id = p_thread_id AND org_id = current_user_org_id();

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
  JOIN profiles p ON p.auth_id = gp.author_id AND p.org_id = gp.org_id
  WHERE gp.thread_id  = p_thread_id
    AND gp.is_deleted = FALSE
    AND gp.org_id = current_user_org_id()
    AND gp.group_id = v_group_id
  ORDER BY gp.created_at ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.find_related_concepts(p_source_chunk_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(chunk_id uuid, source_type text, source_id uuid, chunk_text text, similarity double precision, section_id uuid, section_code text, blueprint_title text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_embedding vector(1536);
BEGIN
  IF NOT COALESCE(current_user_tenant_active(), FALSE)
    OR COALESCE(current_user_role()::text, '') NOT IN ('admin', 'manager', 'teacher') THEN
    RAISE EXCEPTION 'find_related_concepts requires staff role';
  END IF;

  SELECT embedding INTO v_embedding
  FROM embeddings
  WHERE id = p_source_chunk_id AND org_id = current_user_org_id() AND is_active;

  IF v_embedding IS NULL THEN
    RAISE EXCEPTION 'Source chunk not found';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_text,
    (1 - (e.embedding <=> v_embedding))::FLOAT AS similarity,
    e.section_id,
    cs.section_code,
    cb.title
  FROM embeddings e
  LEFT JOIN course_sections   cs ON cs.id = e.section_id AND cs.org_id = e.org_id
  LEFT JOIN course_blueprints cb ON cb.id = cs.blueprint_id AND cb.org_id = e.org_id
  WHERE
    e.id        != p_source_chunk_id
    AND e.is_active = TRUE
    AND e.org_id = current_user_org_id()
    AND (1 - (e.embedding <=> v_embedding)) >= 0.75
  ORDER BY e.embedding <=> v_embedding
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_section_access(p_user_id uuid, p_section_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(current_user_tenant_active(), FALSE)
    AND p_user_id IN (auth.uid(), current_user_uid())
    AND EXISTS (
      SELECT 1 FROM direct_enrollments de
      JOIN course_sections cs ON cs.id = de.section_id AND cs.org_id = de.org_id
      JOIN access_windows aw ON aw.section_id = de.section_id AND aw.org_id = de.org_id
      WHERE de.user_id = auth.uid() AND de.org_id = current_user_org_id()
        AND de.section_id = p_section_id AND de.status = 'active'
        AND NOW() BETWEEN aw.start_date AND aw.end_date + aw.grace_days * INTERVAL '1 day'
    );
$$;

-- The invoker context builder needs only the caller's enrolled access-window end.
-- Direct student reads of access_windows remain forbidden by its existing RLS.
CREATE OR REPLACE FUNCTION public.get_my_section_access_window(p_section_id uuid)
RETURNS TABLE(end_date timestamptz) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT aw.end_date FROM access_windows aw
  WHERE aw.section_id = p_section_id AND aw.org_id = current_user_org_id()
    AND check_section_access(current_user_uid(), p_section_id);
$$;
REVOKE ALL ON FUNCTION public.get_my_section_access_window(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_section_access_window(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.build_tutor_context(p_user_id uuid, p_section_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_context JSONB;
BEGIN
  IF NOT COALESCE(check_section_access(p_user_id, p_section_id), FALSE) THEN
    RAISE EXCEPTION 'No active enrollment for user';
  END IF;
  SELECT jsonb_build_object(
    'userId',             p_user_id,
    'sectionId',          cs.id,
    'sectionCode',        cs.section_code,
    'blueprintTitle',     cb.title,
    'termName',           at.term_name,
    'deliveryFormat',     cs.delivery_format,
    'cohortName',         gc.cohort_name,
    'cohortCode',         gc.cohort_code,
    'programTrackName',   pt.name,
    'programTrackCode',   pt.code,
    'enrollmentStatus',   de.status,
    'accessWindowOpen',   check_section_access(p_user_id, p_section_id),
    'accessWindowEnd',    aw.end_date,
    'contextVersion',     'v1'
  )
  INTO v_context
  FROM direct_enrollments de
  JOIN course_sections    cs ON cs.id = de.section_id
  JOIN course_blueprints  cb ON cb.id = cs.blueprint_id
  JOIN academic_terms     at ON at.id = cs.term_id
  JOIN get_my_section_access_window(p_section_id) aw ON TRUE
  LEFT JOIN cohort_members   cm ON cm.user_id = de.user_id AND cm.status = 'active'
  LEFT JOIN global_cohorts   gc ON gc.id = cm.cohort_id
  LEFT JOIN program_tracks   pt ON pt.id = gc.program_track_id
  WHERE de.user_id    = auth.uid()
    AND de.org_id = current_user_org_id()
    AND de.section_id = p_section_id
    AND de.status     = 'active'
  LIMIT 1;

  IF v_context IS NULL THEN
    RAISE EXCEPTION 'No active enrollment for user';
  END IF;

  RETURN v_context;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_user_active_sections(p_user_id uuid)
 RETURNS TABLE(section_id uuid, section_code text, blueprint_title text, term_name text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.section_code,
    cb.title,
    at.term_name
  FROM direct_enrollments de
  JOIN course_sections    cs ON cs.id = de.section_id
  JOIN course_blueprints  cb ON cb.id = cs.blueprint_id
  JOIN academic_terms     at ON at.id = cs.term_id
  WHERE de.user_id = auth.uid()
    AND p_user_id IN (auth.uid(), current_user_uid())
    AND de.org_id = current_user_org_id()
    AND de.status  = 'active'
    AND check_section_access(p_user_id, cs.id)
  ORDER BY at.start_date DESC;
END;
$function$;

DROP POLICY IF EXISTS "group_threads: members insert own org" ON public.group_threads;
CREATE POLICY "group_threads: members insert own org" ON public.group_threads
FOR INSERT TO authenticated WITH CHECK (
  current_user_tenant_active() AND org_id = current_user_org_id()
  AND created_by = (SELECT auth_id FROM public.profile_roles WHERE uid = current_user_uid())
  AND is_group_member(group_id)
);
DROP POLICY IF EXISTS "group_posts: members insert own org" ON public.group_posts;
CREATE POLICY "group_posts: members insert own org" ON public.group_posts
FOR INSERT TO authenticated WITH CHECK (
  current_user_tenant_active() AND org_id = current_user_org_id()
  AND author_id = (SELECT auth_id FROM public.profile_roles WHERE uid = current_user_uid())
  AND is_group_member(group_id)
  AND EXISTS (SELECT 1 FROM public.group_threads t
    WHERE t.id = thread_id AND t.group_id = group_posts.group_id
      AND t.org_id = group_posts.org_id AND NOT t.is_locked)
);

DROP POLICY IF EXISTS "section_groups: active tenant boundary" ON public.section_groups;
CREATE POLICY "section_groups: active tenant boundary" ON public.section_groups
AS RESTRICTIVE FOR ALL TO authenticated
USING (current_user_tenant_active() AND org_id = current_user_org_id())
WITH CHECK (current_user_tenant_active() AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "section_group_members: active tenant boundary" ON public.section_group_members;
CREATE POLICY "section_group_members: active tenant boundary" ON public.section_group_members
AS RESTRICTIVE FOR ALL TO authenticated
USING (current_user_tenant_active() AND org_id = current_user_org_id())
WITH CHECK (current_user_tenant_active() AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "group_threads: active tenant boundary" ON public.group_threads;
CREATE POLICY "group_threads: active tenant boundary" ON public.group_threads
AS RESTRICTIVE FOR ALL TO authenticated
USING (current_user_tenant_active() AND org_id = current_user_org_id())
WITH CHECK (current_user_tenant_active() AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "group_posts: active tenant boundary" ON public.group_posts;
CREATE POLICY "group_posts: active tenant boundary" ON public.group_posts
AS RESTRICTIVE FOR ALL TO authenticated
USING (current_user_tenant_active() AND org_id = current_user_org_id())
WITH CHECK (current_user_tenant_active() AND org_id = current_user_org_id());

DROP POLICY IF EXISTS "content_pages: learner reads published" ON public.content_pages;
CREATE POLICY "content_pages: learner reads published" ON public.content_pages
FOR SELECT TO authenticated USING (
  status = 'published' AND org_id = current_user_org_id()
  AND EXISTS (SELECT 1 FROM public.enrollments e
    WHERE e.course_id = content_pages.course_id AND e.user_id = current_user_uid()
      AND e.org_id = content_pages.org_id
      AND e.transit_status IN ('not_started', 'in_progress', 'completed'))
);

DROP POLICY IF EXISTS "group_posts: authors update own org" ON public.group_posts;
CREATE POLICY "group_posts: authors update own org" ON public.group_posts
FOR UPDATE TO authenticated
USING (org_id = current_user_org_id()
  AND author_id = (SELECT auth_id FROM public.profile_roles WHERE uid = current_user_uid()))
WITH CHECK (org_id = current_user_org_id()
  AND author_id = (SELECT auth_id FROM public.profile_roles WHERE uid = current_user_uid())
  AND is_group_member(group_id)
  AND EXISTS (SELECT 1 FROM public.group_threads t
    WHERE t.id = thread_id AND t.group_id = group_posts.group_id AND t.org_id = group_posts.org_id));
