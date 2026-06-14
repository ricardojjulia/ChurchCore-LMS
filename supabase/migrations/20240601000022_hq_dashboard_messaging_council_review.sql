-- ═══════════════════════════════════════════════════════════════════════
-- Migration 022: Persist Dashboard + Messaging Council Review CR-2024-002
-- ═══════════════════════════════════════════════════════════════════════

-- ── Extend HQ tables with missing columns ────────────────────────────
ALTER TABLE public.hq_decisions
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.hq_tasks
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS decision_id  UUID REFERENCES public.hq_decisions(id) ON DELETE SET NULL;

ALTER TABLE public.hq_risks
  ADD COLUMN IF NOT EXISTS description  TEXT,
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','mitigated','accepted','closed')),
  ADD COLUMN IF NOT EXISTS likelihood   TEXT
    CHECK (likelihood IN ('low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS decision_id  UUID REFERENCES public.hq_decisions(id) ON DELETE SET NULL;

-- ── Decision record ────────────────────────────────────────────────────
INSERT INTO public.hq_decisions (
  id,
  title,
  description,
  status,
  owner,
  impact,
  created_at
) VALUES (
  gen_random_uuid(),
  'ADR-2024-DASH-002: Smart Dashboard, Messaging, Calendar & Performance',
  E'Fully approved transformation of the LMS from a course-list interface into a role-aware, communication-rich, academically contextual dashboard.\n\nKey decisions:\n• D1 – Server-side role resolution only\n• D2 – All message sends routed through server action: rate-limit + sanitize + participant-validate\n• D3 – Calendar implemented as v_unified_calendar synthesized view\n• D4 – Academic performance via mv_academic_performance MV + security-definer functions\n• D5 – Notifications decoupled from messages; unified table covers all LMS event types\n• D6 – Dashboard layout stored as dashboard_layout JSONB in profiles\n\nNew tables: message_threads, message_thread_participants, messages, announcements, announcement_reads, notifications, calendar_events\nReference: docs/council/CR-2024-002-Smart-Dashboard-Messaging.md',
  'Accepted',
  'The Architect',
  'High',
  NOW()
) ON CONFLICT DO NOTHING;

-- ── Phase tasks ─────────────────────────────────────────────────────────
WITH decision AS (
  SELECT id FROM public.hq_decisions
  WHERE title = 'ADR-2024-DASH-002: Smart Dashboard, Messaging, Calendar & Performance'
  LIMIT 1
)
INSERT INTO public.hq_tasks (title, description, status, priority, source, decision_id, created_at)
SELECT t.title, t.description, 'backlog'::text, t.priority, 'council'::text, decision.id, NOW()
FROM decision, (VALUES
  ('Build resolveUserDashboardContext() server function',
   'Create lib/dashboard/context.ts with server-side function reading profile + role + enrollments. Role from profile_roles helpers only — never client claims.',
   'P1'),
  ('Implement role-based dashboard routing',
   'Rewrite dashboard/page.tsx as Server Component calling resolveUserDashboardContext(), rendering StudentDashboard, InstructorDashboard, or AdminDashboard.',
   'P1'),
  ('Build dashboard shell components (Student/Instructor/Admin)',
   'Three role-variant components. Student: course progress cards. Instructor: Action Required panel. Admin: institution stats.',
   'P1'),
  ('Add transit states to enrollments',
   'Add transit_status, completed_at, progress_percent to enrollments. Update RLS.',
   'P1'),
  ('Build CourseCard with progress bar',
   'Show progress bar, transit state, last accessed, CTA that deep-links to next incomplete block.',
   'P1'),
  ('Build Smart Summary Card and Notifications system',
   'Greeting card with context summary. notifications table + bell icon with unread count. Mark-read and dismiss actions.',
   'P1'),
  ('Create messaging tables and RLS',
   'message_threads, message_thread_participants, messages with full RLS. Users only see threads they participate in.',
   'P2'),
  ('Build realtime inbox and thread view UI',
   '/messages route: inbox list + thread view. Realtime via postgres_changes.',
   'P2'),
  ('Integrate messages preview on dashboard',
   'Last 3 unread threads on dashboard. Unread badge on nav Messages link.',
   'P2'),
  ('Build announcements system with scope-aware RLS',
   'announcements + announcement_reads tables. Scope: global/course/role. Priority levels. Composer with scope selector.',
   'P2'),
  ('Build unified calendar view',
   'calendar_events + v_unified_calendar view. GET /api/calendar endpoint. Full calendar page + mini widget.',
   'P2'),
  ('Create mv_academic_performance MV',
   'Grade aggregation, GPA 0-4.0 scale, at-risk detection. SECURITY DEFINER query functions.',
   'P3'),
  ('Build student performance panel and instructor analytics',
   'Student performance page with GPA + grades. Instructor analytics with at-risk list + CSV export.',
   'P3'),
  ('Build interactive learning shell',
   '/courses/[id]/learn with sidebar navigation, block players (video, assignment, quiz), progress tracking.',
   'P3')
) AS t(title, description, priority)
ON CONFLICT DO NOTHING;

-- ── Risks ──────────────────────────────────────────────────────────────
WITH decision AS (
  SELECT id FROM public.hq_decisions
  WHERE title = 'ADR-2024-DASH-002: Smart Dashboard, Messaging, Calendar & Performance'
  LIMIT 1
)
INSERT INTO public.hq_risks (title, description, severity, probability, likelihood, mitigation, status, decision_id, created_at)
SELECT r.title, r.description, r.severity, r.prob, r.likelihood, r.mitigation, 'open'::text, decision.id, NOW()
FROM decision, (VALUES
  ('Cross-user message access (no RLS)',
   'Without RLS any authenticated user can read any thread by guessing UUIDs.',
   5, 4, 'high',
   'RLS enabled on ALL messaging tables. message_thread_participants is the join gate.'),
  ('XSS via message body',
   'Unescaped message content allows script injection.',
   4, 4, 'high',
   'All message bodies stripped with server-side stripHtml() before DB write.'),
  ('Message spam and harassment',
   'Attacker sends hundreds of messages per minute.',
   4, 3, 'medium',
   'Rate limit: 20 messages per 60s per user enforced in server action.'),
  ('Student views other students grades',
   'mv_academic_performance contains grades for all students.',
   4, 3, 'medium',
   'MV never queried directly. SECURITY DEFINER functions filter by current_user_uid().'),
  ('Dashboard role escalation via client claim',
   'Student claims role=admin to access elevated UI.',
   4, 3, 'medium',
   'resolveUserDashboardContext() always reads role from DB — no client input accepted.'),
  ('Announcement scope misconfiguration',
   'Instructor accidentally publishes course-scoped announcement as global.',
   3, 3, 'medium',
   'RLS validates instructors can only create course-scoped announcements.'),
  ('Realtime channel leakage',
   'Realtime delivers messages to wrong user client.',
   3, 2, 'low',
   'Realtime filtered by RLS via postgres_changes — only rows user can SELECT trigger their channel.'),
  ('MV refresh blocking under load',
   'REFRESH MATERIALIZED VIEW CONCURRENTLY takes long under heavy grade load.',
   3, 3, 'medium',
   'CONCURRENTLY avoids table locks. Trigger-based refresh only on grade changes.'),
  ('Notification fatigue causing opt-out',
   'Too many notifications cause users to disable all, breaking time-sensitive alerts.',
   3, 4, 'high',
   'Default: badge only for messages, no sound. Users control granularity per type.')
) AS r(title, description, severity, prob, likelihood, mitigation)
ON CONFLICT DO NOTHING;
