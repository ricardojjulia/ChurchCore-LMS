-- ═══════════════════════════════════════════════════════════════════════
-- Migration 025: Announcements + Calendar
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Announcements ──────────────────────────────────────────────────

CREATE TABLE public.announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,

  -- Targeting
  scope        TEXT NOT NULL DEFAULT 'global'
               CHECK (scope IN ('global','course','role')),
  course_id    UUID REFERENCES public.courses(id) ON DELETE CASCADE,
  target_role  TEXT CHECK (target_role IN ('student','teacher','manager','admin')),

  -- Content
  title        TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  priority     TEXT NOT NULL DEFAULT 'normal'
               CHECK (priority IN ('low','normal','high','urgent')),

  -- Scheduling
  publish_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,

  -- State
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Admin/instructor: manage own announcements
CREATE POLICY "announcements: staff manage own"
  ON public.announcements FOR ALL TO authenticated
  USING  (
    created_by = current_user_uid()
    AND current_user_role() IN ('admin','teacher','manager')
  )
  WITH CHECK (
    created_by = current_user_uid()
    AND current_user_role() IN ('admin','teacher','manager')
    -- instructors can only create course-scoped announcements (admins can do all)
    AND (
      current_user_role() = 'admin'
      OR scope = 'course'
    )
  );

-- Everyone: read published, non-expired, targeted announcements
CREATE POLICY "announcements: read targeted"
  ON public.announcements FOR SELECT TO authenticated
  USING (
    is_published = TRUE
    AND publish_at <= NOW()
    AND (expires_at IS NULL OR expires_at > NOW())
    AND (
      scope = 'global'
      OR (
        scope = 'course'
        AND EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.course_id = announcements.course_id
            AND e.user_id   = current_user_uid()
        )
      )
      OR (
        scope = 'role'
        AND current_user_role()::TEXT = target_role
      )
    )
  );

CREATE INDEX idx_announcements_publish ON public.announcements(is_published, publish_at DESC);
CREATE INDEX idx_announcements_course  ON public.announcements(course_id) WHERE course_id IS NOT NULL;

-- ── 2. Announcement reads ─────────────────────────────────────────────

CREATE TABLE public.announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(uid)    ON DELETE CASCADE,
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "announcement_reads: user owns"
  ON public.announcement_reads FOR ALL TO authenticated
  USING  (user_id = current_user_uid())
  WITH CHECK (user_id = current_user_uid());

CREATE INDEX idx_ann_reads_user ON public.announcement_reads(user_id, announcement_id);

-- ── 3. Calendar events ────────────────────────────────────────────────

CREATE TABLE public.calendar_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by     UUID NOT NULL REFERENCES public.profiles(uid) ON DELETE CASCADE,
  user_id        UUID REFERENCES public.profiles(uid) ON DELETE CASCADE,
  course_id      UUID REFERENCES public.courses(id)  ON DELETE CASCADE,

  event_type     TEXT NOT NULL DEFAULT 'custom'
                 CHECK (event_type IN (
                   'assignment_due','course_start','course_end',
                   'exam','office_hours','custom','holiday','institutional'
                 )),

  title          TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description    TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  is_all_day     BOOLEAN NOT NULL DEFAULT FALSE,
  timezone       TEXT NOT NULL DEFAULT 'UTC',
  location       TEXT,
  color_code     TEXT NOT NULL DEFAULT '#6366F1',

  scope          TEXT NOT NULL DEFAULT 'personal'
                 CHECK (scope IN ('personal','course','institutional')),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- Personal events: only creator sees them
-- Course events: enrolled users see them
-- Institutional events: all authenticated users see them
CREATE POLICY "calendar_events: scoped select"
  ON public.calendar_events FOR SELECT TO authenticated
  USING (
    scope = 'institutional'
    OR (
      scope = 'personal'
      AND (user_id = current_user_uid() OR created_by = current_user_uid())
    )
    OR (
      scope = 'course'
      AND (
        created_by = current_user_uid()
        OR EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.course_id = calendar_events.course_id
            AND e.user_id   = current_user_uid()
        )
      )
    )
  );

-- Authenticated users create personal/course events
CREATE POLICY "calendar_events: insert"
  ON public.calendar_events FOR INSERT TO authenticated
  WITH CHECK (
    created_by = current_user_uid()
    AND (
      scope IN ('personal','institutional')
      OR (
        scope = 'course'
        AND EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.course_id = calendar_events.course_id
            AND e.user_id   = current_user_uid()
        )
      )
    )
    -- Only admin/manager can create institutional events
    AND (
      scope != 'institutional'
      OR current_user_role() IN ('admin','manager')
    )
  );

-- Creator can update/delete their own events
CREATE POLICY "calendar_events: creator manage"
  ON public.calendar_events FOR UPDATE USING (created_by = current_user_uid());

CREATE POLICY "calendar_events: creator delete"
  ON public.calendar_events FOR DELETE USING (created_by = current_user_uid());

CREATE INDEX idx_calendar_events_user   ON public.calendar_events(user_id, starts_at);
CREATE INDEX idx_calendar_events_course ON public.calendar_events(course_id, starts_at);
CREATE INDEX idx_calendar_events_scope  ON public.calendar_events(scope, starts_at);

-- ── 4. Unified calendar view ──────────────────────────────────────────
-- Synthesizes all calendar sources into one queryable surface.
-- RLS from calendar_events flows through automatically.

CREATE OR REPLACE VIEW public.v_unified_calendar AS
SELECT
  ce.id::TEXT      AS source_id,
  ce.event_type,
  ce.title,
  ce.description,
  ce.course_id,
  ce.user_id,
  ce.scope,
  ce.starts_at,
  ce.ends_at,
  ce.is_all_day,
  ce.color_code,
  ce.location,
  c.title          AS course_name
FROM public.calendar_events ce
LEFT JOIN public.courses c ON c.id = ce.course_id;
