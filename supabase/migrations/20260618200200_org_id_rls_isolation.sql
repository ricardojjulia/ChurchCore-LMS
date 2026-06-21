-- ─── org_id isolation: add org_id to all tables missing it, rewrite RLS ──────
-- Every table gets: org_id NOT NULL FK, backfill from created_by/user_id → profiles.org_id,
-- and RLS policies that enforce: is_platform_admin() OR current_user_org_id() = org_id.
-- Run AFTER 20260618200000 (platform_admins) and 20260618200100 (tenant_lifecycle).

-- ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.announcements a
SET org_id = p.org_id
FROM public.profiles p
WHERE a.created_by = p.uid AND a.org_id IS NULL AND p.org_id IS NOT NULL;

-- Default remaining to first org (single-tenant installs)
UPDATE public.announcements
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.announcements ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "announcements: staff manage own"  ON public.announcements;
DROP POLICY IF EXISTS "announcements: read targeted"     ON public.announcements;

CREATE POLICY "announcements: members read own org"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.current_user_org_id() = org_id
      AND (
        scope = 'global'
        OR (scope = 'course' AND course_id IN (
          SELECT course_id FROM public.enrollments WHERE user_id = public.current_user_uid()
        ))
      )
    )
  );

CREATE POLICY "announcements: staff manage own org"
  ON public.announcements FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── ANNOUNCEMENT_READS ───────────────────────────────────────────────────────
ALTER TABLE public.announcement_reads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.announcement_reads ar
SET org_id = a.org_id
FROM public.announcements a
WHERE ar.announcement_id = a.id AND ar.org_id IS NULL;

UPDATE public.announcement_reads
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.announcement_reads ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "announcement_reads: user owns" ON public.announcement_reads;

CREATE POLICY "announcement_reads: user owns"
  ON public.announcement_reads FOR ALL TO authenticated
  USING  (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

-- ─── CALENDAR_EVENTS ─────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.calendar_events e
SET org_id = p.org_id
FROM public.profiles p
WHERE e.created_by = p.uid AND e.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.calendar_events
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.calendar_events ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "calendar_events: scoped select"  ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events: insert"         ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events: creator manage" ON public.calendar_events;
DROP POLICY IF EXISTS "calendar_events: creator delete" ON public.calendar_events;

CREATE POLICY "calendar_events: members read own org"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (public.is_platform_admin() OR public.current_user_org_id() = org_id);

CREATE POLICY "calendar_events: staff manage own org"
  ON public.calendar_events FOR ALL TO authenticated
  USING (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    (public.is_platform_admin() OR public.current_user_org_id() = org_id)
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.notifications n
SET org_id = p.org_id
FROM public.profiles p
WHERE n.user_id = p.uid AND n.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.notifications
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.notifications ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "notifications: user owns" ON public.notifications;

CREATE POLICY "notifications: user reads own"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "notifications: user updates own"
  ON public.notifications FOR UPDATE TO authenticated
  USING  (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

CREATE POLICY "notifications: service role insert"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);

-- ─── MESSAGE_THREADS ─────────────────────────────────────────────────────────
ALTER TABLE public.message_threads
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Backfill from first participant's org
UPDATE public.message_threads t
SET org_id = p.org_id
FROM public.message_thread_participants mtp
JOIN public.profiles p ON p.uid = mtp.user_id
WHERE mtp.thread_id = t.id AND t.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.message_threads
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.message_threads ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "message_threads: participants can view"  ON public.message_threads;
DROP POLICY IF EXISTS "message_threads: participants can start" ON public.message_threads;

CREATE POLICY "message_threads: participants read own org"
  ON public.message_threads FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND id IN (
      SELECT thread_id FROM public.message_thread_participants
      WHERE user_id = public.current_user_uid()
    )
  );

CREATE POLICY "message_threads: participants insert"
  ON public.message_threads FOR INSERT TO authenticated
  WITH CHECK (public.current_user_org_id() = org_id);

-- ─── MESSAGE_THREAD_PARTICIPANTS ─────────────────────────────────────────────
ALTER TABLE public.message_thread_participants
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.message_thread_participants mtp
SET org_id = t.org_id
FROM public.message_threads t
WHERE mtp.thread_id = t.id AND mtp.org_id IS NULL;

UPDATE public.message_thread_participants
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.message_thread_participants ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "message_thread_participants: participants can view" ON public.message_thread_participants;

CREATE POLICY "message_thread_participants: read own org"
  ON public.message_thread_participants FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND thread_id IN (
      SELECT thread_id FROM public.message_thread_participants p2
      WHERE p2.user_id = public.current_user_uid()
    )
  );

CREATE POLICY "message_thread_participants: insert own org"
  ON public.message_thread_participants FOR INSERT TO authenticated
  WITH CHECK (public.current_user_org_id() = org_id);

-- ─── MESSAGES ────────────────────────────────────────────────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.messages m
SET org_id = t.org_id
FROM public.message_threads t
WHERE m.thread_id = t.id AND m.org_id IS NULL;

UPDATE public.messages
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.messages ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "messages: participant select"     ON public.messages;
DROP POLICY IF EXISTS "messages: participant insert"     ON public.messages;
DROP POLICY IF EXISTS "messages: self soft delete"       ON public.messages;

CREATE POLICY "messages: participants read own org"
  ON public.messages FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND thread_id IN (
      SELECT thread_id FROM public.message_thread_participants
      WHERE user_id = public.current_user_uid()
    )
  );

CREATE POLICY "messages: participants send own org"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND sender_id = public.current_user_uid()
  );

CREATE POLICY "messages: sender soft delete"
  ON public.messages FOR UPDATE TO authenticated
  USING  (sender_id = public.current_user_uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (sender_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

-- ─── BLOCK_SUBMISSIONS ───────────────────────────────────────────────────────
ALTER TABLE public.block_submissions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.block_submissions s
SET org_id = p.org_id
FROM public.profiles p
WHERE s.user_id = p.uid AND s.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.block_submissions
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.block_submissions ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "block_submissions: students view own"         ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: students submit"           ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: students update own draft" ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: staff view course subs"    ON public.block_submissions;
DROP POLICY IF EXISTS "block_submissions: staff grade"               ON public.block_submissions;

CREATE POLICY "block_submissions: students view own"
  ON public.block_submissions FOR SELECT TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "block_submissions: students submit"
  ON public.block_submissions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "block_submissions: students update own draft"
  ON public.block_submissions FOR UPDATE TO authenticated
  USING  (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id)
  WITH CHECK (user_id = public.current_user_uid() AND public.current_user_org_id() = org_id);

CREATE POLICY "block_submissions: staff view own org"
  ON public.block_submissions FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

CREATE POLICY "block_submissions: staff grade own org"
  ON public.block_submissions FOR UPDATE TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager','teacher')
  )
  WITH CHECK (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

-- ─── COURSE_CERTIFICATES ─────────────────────────────────────────────────────
ALTER TABLE public.course_certificates
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.course_certificates c
SET org_id = p.org_id
FROM public.profiles p
WHERE c.user_id = p.uid AND c.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.course_certificates
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.course_certificates ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "certificates: user reads own"                ON public.course_certificates;
DROP POLICY IF EXISTS "certificates: staff reads"                   ON public.course_certificates;
DROP POLICY IF EXISTS "rls_certificates_student_select"             ON public.course_certificates;
DROP POLICY IF EXISTS "rls_certificates_instructor_admin_select"    ON public.course_certificates;

CREATE POLICY "course_certificates: students read own"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (
    user_id = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "course_certificates: staff read own org"
  ON public.course_certificates FOR SELECT TO authenticated
  USING (
    public.current_user_org_id() = org_id
    AND public.current_user_role() IN ('admin','manager','teacher')
  );

CREATE POLICY "course_certificates: service role insert"
  ON public.course_certificates FOR INSERT TO service_role
  WITH CHECK (true);

-- ─── GUARDIAN_LINKS ───────────────────────────────────────────────────────────
ALTER TABLE public.guardian_links
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.guardian_links g
SET org_id = p.org_id
FROM public.profiles p
WHERE g.guardian_uid = p.uid AND g.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.guardian_links
SET org_id = (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1)
WHERE org_id IS NULL;

ALTER TABLE public.guardian_links ALTER COLUMN org_id SET NOT NULL;

DROP POLICY IF EXISTS "guardian_links: guardian reads own" ON public.guardian_links;
DROP POLICY IF EXISTS "guardian_links: staff reads all"    ON public.guardian_links;

CREATE POLICY "guardian_links: guardians read own"
  ON public.guardian_links FOR SELECT TO authenticated
  USING (
    guardian_uid = public.current_user_uid()
    AND public.current_user_org_id() = org_id
  );

CREATE POLICY "guardian_links: admins manage own org"
  ON public.guardian_links FOR ALL TO authenticated
  USING  (public.current_user_org_id() = org_id AND public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_org_id() = org_id AND public.current_user_role() = 'admin');

-- ─── PROFILES: add suspended-tenant and platform admin bypass ────────────────
DROP POLICY IF EXISTS "profiles: users read own"          ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff read same org"     ON public.profiles;
DROP POLICY IF EXISTS "profiles: staff read others"       ON public.profiles;
DROP POLICY IF EXISTS "profiles: platform admin read all" ON public.profiles;
DROP POLICY IF EXISTS "profiles: users update own"        ON public.profiles;

CREATE POLICY "profiles: users read own"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    uid = public.current_user_uid()
    AND (
      SELECT tenant_active
      FROM public.profile_roles
      WHERE auth_id = auth.uid()
      LIMIT 1
    ) = true
  );

CREATE POLICY "profiles: staff read same org"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role() IN ('admin','manager','teacher')
    AND (
      SELECT tenant_active
      FROM public.profile_roles
      WHERE auth_id = auth.uid()
      LIMIT 1
    ) = true
  );

CREATE POLICY "profiles: platform admin read all"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY "profiles: users update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING  (uid = public.current_user_uid())
  WITH CHECK (uid = public.current_user_uid());
