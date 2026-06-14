# Council Review: Student & Instructor Smart Dashboard + Messaging System
## ChurchCore LMS — Feature Evaluation CR-2024-002

---

## 1. EXECUTIVE SUMMARY

This proposal transforms the LMS from a course-list interface into a **role-aware, communication-rich, academically contextual dashboard**. The feature encompasses six interconnected subsystems:

1. **Smart Role-Aware Dashboard** — different views for students, instructors, and admins
2. **Internal Messaging System** — student-to-student, instructor-to-student, admin broadcasts
3. **Academic Calendar** — courses, sessions, assignments, deadlines, events
4. **Academic Performance View** — live gradebook, progress, completion rates
5. **Course Transit System** — in-progress, completed, enrolled-not-started states
6. **Announcement/Admin Message System** — institution-wide and course-scoped broadcasts

This is the **highest-impact UX feature** in the LMS. It is the first thing every user sees every session. Getting it wrong means low engagement and high churn. Getting it right means the LMS becomes the daily habit for every student and instructor.

**The council recommends full approval** with a phased delivery strategy that ships a functional dashboard core in Phase 1 and layers communication, calendar, and analytics progressively. The messaging system carries the highest security surface area and must be treated as a first-class security domain.

---

## 2. RECOMMENDATION

```
STATUS:   FULLY APPROVED
PHASE:    Parallel development tracks — Dashboard core blocks nothing
RISK:     MEDIUM (messaging abuse), LOW (dashboard), MEDIUM (real-time scale)
PRIORITY: CRITICAL PATH — This is the primary user surface
```

### Conditions

| # | Condition | Owner |
|---|-----------|-------|
| C1 | Messaging system has RLS on every table — no shared inboxes via client queries | Security |
| C2 | Admin broadcast uses async queue pattern — not direct DB writes at scale | Backend |
| C3 | Calendar is read-synthesized from existing tables — no duplicate data | Backend |
| C4 | Role detection is server-side only — dashboard variant never trusts client role claim | Security |
| C5 | Realtime subscriptions are scoped per-user — no room-broadcast leakage | Security |
| C6 | Performance view aggregations use materialized views — not live JOINs on render | Backend |
| C7 | Message content is sanitized server-side before storage | Security |

---

## 3. ARCHITECTURE IMPACT

### 3.1 System Topology

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           VERCEL EDGE / APP ROUTER                       │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                     DASHBOARD SHELL (Server Component)             │  │
│  │                                                                    │  │
│  │   resolveUserContext(session) → { role, enrollments, permissions } │  │
│  │              ↓                                                     │  │
│  │   ┌──────────────────────────────────────────────────────────┐    │  │
│  │   │              ROLE ROUTER (Server-side)                   │    │  │
│  │   │                                                          │    │  │
│  │   │  role=student   → <StudentDashboard />                   │    │  │
│  │   │  role=instructor → <InstructorDashboard />               │    │  │
│  │   │  role=admin     → <AdminDashboard />                     │    │  │
│  │   └──────────────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐  │
│  │  Messages   │ │  Calendar   │ │ Performance │ │   Courses Rail   │  │
│  │  Panel      │ │  Panel      │ │  Panel      │ │  (transit/done)  │  │
│  │  (Client)   │ │  (Client)   │ │  (Server)   │ │  (Server)        │  │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └─────────┬────────┘  │
└─────────┼───────────────┼───────────────┼───────────────────┼───────────┘
          │               │               │                   │
          ▼               ▼               ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            SUPABASE                                     │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐  │
│  │  Realtime    │  │  Edge Fns    │  │  Postgres                   │  │
│  │              │  │              │  │                             │  │
│  │  messages    │  │  send-msg    │  │  messages                   │  │
│  │  channel     │  │  broadcast   │  │  message_threads            │  │
│  │  (per-user   │  │  digest-     │  │  announcements              │  │
│  │   postgres   │  │  email       │  │  calendar_events (view)     │  │
│  │   changes)   │  │  moderate-   │  │  mv_academic_performance    │  │
│  │              │  │  message     │  │  notifications              │  │
│  └──────────────┘  └──────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Dashboard Layout Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Search | Notifications Bell | Avatar Menu           │
├──────────┬──────────────────────────────────────┬───────────────────┤
│          │                                      │                   │
│  NAV     │         MAIN CONTENT AREA            │   RIGHT RAIL      │
│  RAIL    │                                      │                   │
│          │  ┌──────────────────────────────┐    │  ┌─────────────┐  │
│  📚 Dash │  │  GREETING + CONTEXT CARD     │    │  │  CALENDAR   │  │
│  ✉ Msgs  │  │  "Good morning, John."       │    │  │  WIDGET     │  │
│  📅 Cal  │  │  "Your next class is in 2h"  │    │  │  (mini)     │  │
│  📊 Perf │  └──────────────────────────────┘    │  └─────────────┘  │
│  🎓 Crs  │                                      │                   │
│  ⚙ Sett │  ┌──────────┐ ┌──────────┐           │  ┌─────────────┐  │
│          │  │COURSE    │ │COURSE    │  ...       │  │ ANNOUNCE-   │  │
│          │  │CARD IN   │ │CARD IN   │            │  │ MENTS       │  │
│          │  │PROGRESS  │ │PROGRESS  │            │  │ FEED        │  │
│          │  └──────────┘ └──────────┘            │  └─────────────┘  │
│          │                                      │                   │
│          │  ┌──────────────────────────────┐    │  ┌─────────────┐  │
│          │  │  RECENT MESSAGES PREVIEW     │    │  │ UPCOMING    │  │
│          │  │  (last 3 threads)            │    │  │ DEADLINES   │  │
│          │  └──────────────────────────────┘    │  └─────────────┘  │
│          │                                      │                   │
│          │  ┌──────────────────────────────┐    │                   │
│          │  │  PERFORMANCE SUMMARY         │    │                   │
│          │  │  GPA | Completion | Streak   │    │                   │
│          │  └──────────────────────────────┘    │                   │
│          │                                      │                   │
└──────────┴──────────────────────────────────────┴───────────────────┘
```

### 3.3 Role-Aware Dashboard Routing

```typescript
// app/dashboard/page.tsx — Server Component
// CRITICAL: Role resolved server-side from DB, never from client claims
export default async function DashboardPage() {
  const supabase = createServerClient();
  const context = await resolveUserDashboardContext(supabase);
  if (!context) redirect('/auth/login');

  switch (context.primaryRole) {
    case 'admin':      return <AdminDashboard context={context} />;
    case 'instructor': return <InstructorDashboard context={context} />;
    default:           return <StudentDashboard context={context} />;
  }
}
```

### 3.4 Realtime Architecture for Messaging

```
User A sends message
        │
        ▼
POST /api/messages/send
(Edge Function: sanitize → validate participant → insert)
        │
        ├──── Supabase Realtime ──────► User B's browser
        │     postgres_changes          channel: user:{userId}:messages
        │     WHERE recipient=userId
        │
        └──── notifications INSERT ──► unread badge update
```

---

## 4. DATA MODEL IMPACT

### 4.1 New Tables

```sql
-- MESSAGING SYSTEM
CREATE TABLE message_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_type     TEXT NOT NULL CHECK (thread_type IN (
                    'direct','group','course','announcement')),
  subject         TEXT,
  course_id       UUID REFERENCES courses(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL REFERENCES profiles(id),
  is_archived     BOOLEAN DEFAULT FALSE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE message_thread_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         TEXT DEFAULT 'member' CHECK (role IN ('owner','member','observer')),
  can_reply    BOOLEAN DEFAULT TRUE,
  last_read_at TIMESTAMPTZ,
  is_muted     BOOLEAN DEFAULT FALSE,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  left_at      TIMESTAMPTZ,
  UNIQUE(thread_id, user_id)
);

CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id    UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES profiles(id),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  body_html    TEXT,
  content_type TEXT DEFAULT 'text' CHECK (content_type IN ('text','html','system')),
  parent_id    UUID REFERENCES messages(id) ON DELETE SET NULL,
  attachments  JSONB DEFAULT '[]',
  is_deleted   BOOLEAN DEFAULT FALSE,
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES profiles(id),
  moderation_flag TEXT CHECK (moderation_flag IN (NULL,'pending','cleared','removed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ANNOUNCEMENTS
CREATE TABLE announcements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by   UUID NOT NULL REFERENCES profiles(id),
  scope        TEXT NOT NULL CHECK (scope IN ('global','course','role')),
  course_id    UUID REFERENCES courses(id) ON DELETE CASCADE,
  target_role  TEXT CHECK (target_role IN ('student','instructor','admin')),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  body_html    TEXT,
  priority     TEXT DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  publish_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  read_count   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE announcement_reads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  read_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

-- NOTIFICATIONS
CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN (
                   'message_received','announcement','assignment_graded',
                   'assignment_due_soon','live_session_starting',
                   'course_enrollment','certificate_earned','grade_posted','system')),
  title          TEXT NOT NULL,
  body           TEXT,
  link           TEXT,
  reference_type TEXT,
  reference_id   UUID,
  is_read        BOOLEAN DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  is_dismissed   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- CALENDAR EVENTS (additional only — most data synthesized from other tables)
CREATE TABLE calendar_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES profiles(id) ON DELETE CASCADE,
  course_id      UUID REFERENCES courses(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES profiles(id),
  event_type     TEXT NOT NULL CHECK (event_type IN (
                   'assignment_due','live_session','course_start','course_end',
                   'exam','office_hours','custom','holiday','institutional')),
  title          TEXT NOT NULL,
  description    TEXT,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ,
  is_all_day     BOOLEAN DEFAULT FALSE,
  timezone       TEXT DEFAULT 'UTC',
  location       TEXT,
  color_code     TEXT,
  is_recurring   BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  scope          TEXT DEFAULT 'personal' CHECK (scope IN ('personal','course','institutional')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Unified Calendar View

```sql
-- Synthesizes assignments + live sessions + custom events
CREATE OR REPLACE VIEW v_unified_calendar AS

SELECT a.id::TEXT AS source_id, 'assignment_due' AS event_type, a.title,
       a.course_id, ce.user_id, a.due_date AS starts_at, a.due_date AS ends_at,
       FALSE AS is_all_day, '#EF4444' AS color_code, c.title AS course_name
FROM assignments a
JOIN courses c ON c.id = a.course_id
JOIN course_enrollments ce ON ce.course_id = a.course_id AND ce.status = 'active'

UNION ALL

SELECT ls.id::TEXT, 'live_session', ls.title, ls.course_id, ce.user_id,
       ls.scheduled_at,
       ls.scheduled_at + (ls.duration_minutes * INTERVAL '1 minute'),
       FALSE, '#3B82F6', c.title
FROM live_sessions ls
JOIN courses c ON c.id = ls.course_id
JOIN course_enrollments ce ON ce.course_id = ls.course_id AND ce.status = 'active'
WHERE ls.status IN ('scheduled','waiting','live')

UNION ALL

SELECT ce_ev.id::TEXT, ce_ev.event_type, ce_ev.title, ce_ev.course_id,
       ce_ev.user_id, ce_ev.starts_at, ce_ev.ends_at,
       ce_ev.is_all_day, ce_ev.color_code, c.title
FROM calendar_events ce_ev
LEFT JOIN courses c ON c.id = ce_ev.course_id;
```

### 4.3 Academic Performance Materialized View

```sql
CREATE MATERIALIZED VIEW mv_academic_performance AS
SELECT
  ce.user_id, ce.course_id, c.title AS course_title, ce.role,
  ce.status AS enrollment_status, ce.progress_percent, ce.last_accessed_at,
  COUNT(s.id) AS total_submissions,
  COUNT(s.id) FILTER (WHERE s.grade IS NOT NULL) AS graded_submissions,
  ROUND(AVG(s.grade) FILTER (WHERE s.grade IS NOT NULL), 2) AS average_grade,
  CASE
    WHEN AVG(s.grade) >= 93 THEN 4.0
    WHEN AVG(s.grade) >= 90 THEN 3.7
    WHEN AVG(s.grade) >= 87 THEN 3.3
    WHEN AVG(s.grade) >= 83 THEN 3.0
    WHEN AVG(s.grade) >= 80 THEN 2.7
    WHEN AVG(s.grade) >= 77 THEN 2.3
    WHEN AVG(s.grade) >= 73 THEN 2.0
    WHEN AVG(s.grade) >= 70 THEN 1.7
    WHEN AVG(s.grade) >= 67 THEN 1.3
    WHEN AVG(s.grade) >= 60 THEN 1.0
    ELSE 0.0
  END AS gpa_points,
  NOW() AS computed_at
FROM course_enrollments ce
JOIN courses c ON c.id = ce.course_id
LEFT JOIN assignments a ON a.course_id = ce.course_id
LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ce.user_id
GROUP BY ce.user_id, ce.course_id, c.title, ce.role,
         ce.status, ce.progress_percent, ce.last_accessed_at;

CREATE UNIQUE INDEX idx_mv_academic_performance ON mv_academic_performance(user_id, course_id);

-- Security-definer gate (views don't support RLS directly)
CREATE OR REPLACE FUNCTION get_my_academic_performance()
RETURNS SETOF mv_academic_performance LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM mv_academic_performance WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION get_course_performance(p_course_id UUID)
RETURNS SETOF mv_academic_performance LANGUAGE sql SECURITY DEFINER AS $$
  SELECT ap.* FROM mv_academic_performance ap
  WHERE ap.course_id = p_course_id
    AND EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = p_course_id
        AND ce.user_id = auth.uid()
        AND ce.role IN ('instructor','admin')
        AND ce.status = 'active'
    );
$$;
```

### 4.4 Modified Tables

```sql
ALTER TABLE profiles
  ADD COLUMN dashboard_layout   JSONB DEFAULT '{}',
  ADD COLUMN notification_prefs JSONB DEFAULT '{}',
  ADD COLUMN timezone           TEXT DEFAULT 'UTC',
  ADD COLUMN last_seen_at       TIMESTAMPTZ,
  ADD COLUMN is_online          BOOLEAN DEFAULT FALSE;

ALTER TABLE course_enrollments
  ADD COLUMN transit_status   TEXT DEFAULT 'not_started'
    CHECK (transit_status IN ('not_started','in_progress','completed','dropped','paused')),
  ADD COLUMN completed_at     TIMESTAMPTZ,
  ADD COLUMN progress_percent NUMERIC(5,2) DEFAULT 0.00
    CHECK (progress_percent BETWEEN 0 AND 100);
```

---

## 5. SECURITY / RLS RISKS

### 5.1 Threat Model

| Threat | Vector | Severity |
|--------|--------|----------|
| User reads another user's messages | Direct table query without RLS | CRITICAL |
| Student impersonates instructor in messages | Missing sender validation | HIGH |
| Bulk message spam / harassment | No rate limiting on send | HIGH |
| Student sees other students' grades | Performance view leakage | HIGH |
| Admin announcement targets wrong audience | Scope misconfiguration | HIGH |
| XSS via message HTML content | Unsanitized body_html | HIGH |
| Deleted message content still readable | Soft-delete bypass | MEDIUM |
| Notification for wrong user | Realtime channel misconfiguration | MEDIUM |
| Calendar event leaks course membership | View joins without user filter | MEDIUM |

### 5.2 Key RLS Policies

```sql
-- messages: only participants can read their thread
CREATE POLICY "participant_reads_messages" ON messages FOR SELECT TO authenticated
USING (
  is_deleted = FALSE
  AND EXISTS (
    SELECT 1 FROM message_thread_participants mtp
    WHERE mtp.thread_id = messages.thread_id
      AND mtp.user_id = auth.uid() AND mtp.left_at IS NULL
  )
);

-- messages: sender must be self AND can_reply=true
CREATE POLICY "participant_sends_message" ON messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM message_thread_participants mtp
    WHERE mtp.thread_id = messages.thread_id
      AND mtp.user_id = auth.uid()
      AND mtp.can_reply = TRUE AND mtp.left_at IS NULL
  )
);

-- announcements: scope-aware visibility
CREATE POLICY "user_reads_targeted_announcements" ON announcements FOR SELECT TO authenticated
USING (
  is_published = TRUE AND publish_at <= NOW()
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (
    scope = 'global'
    OR (scope = 'course' AND EXISTS (
      SELECT 1 FROM course_enrollments ce
      WHERE ce.course_id = announcements.course_id
        AND ce.user_id = auth.uid() AND ce.status = 'active'
    ))
    OR (scope = 'role' AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = announcements.target_role
    ))
  )
);

-- notifications: strict ownership
CREATE POLICY "user_owns_notifications" ON notifications FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 5.3 Message Content Security (Edge Function)

```typescript
// supabase/functions/send-message/index.ts
// 1. Rate limit: 20 messages / 60s, 5 per 10s burst
// 2. Sanitize: DOMPurify strips all non-allowlisted tags
// 3. Validate: participant check via DB (never trust client)
// 4. sender_id ALWAYS set from auth.uid(), never from request body
const sanitizedHtml = DOMPurify.sanitize(body, {
  ALLOWED_TAGS: ['b','i','em','strong','a','p','br','ul','ol','li','code','pre'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
});
```

---

## 6. QA ACCEPTANCE CRITERIA

| ID | Scenario | Expected |
|----|----------|----------|
| FEAT-DASH-001 | Student logs in | StudentDashboard renders, no instructor panels |
| FEAT-DASH-002 | Instructor logs in | InstructorDashboard renders with grading queue |
| FEAT-DASH-003 | Client sends role=admin claim | Server ignores it, renders by DB role |
| FEAT-MSG-001 | User A sends to User B | Delivered via Realtime < 2s, unread badge +1 |
| FEAT-MSG-002 | Thread isolation | User A sees zero rows from Thread B (RLS enforced) |
| FEAT-MSG-003 | Rate limit exceeded | 429, no message stored |
| FEAT-MSG-004 | XSS payload in message body | Script stripped, only text rendered |
| FEAT-MSG-005 | Fabricated thread_id in POST | 403, no message stored |
| FEAT-ANN-001 | Global announcement published | All active users see it |
| FEAT-ANN-002 | Course-scoped announcement | Only enrolled users see it |
| FEAT-ANN-003 | Expired announcement | Not returned by policy |
| FEAT-CAL-001 | Student with 2 assignments + 1 session | All 4 events on calendar, correct colors |
| FEAT-CAL-002 | User timezone = Chicago, session at 20:00 UTC | Shows 2:00 PM CST |
| FEAT-PERF-001 | Student has 5 graded submissions | Correct average, correct GPA bracket |
| FEAT-PERF-002 | Student A queries performance | Only Student A's rows returned |
| FEAT-PERF-003 | Grade posted | MV refreshed within 30s |

### Performance Targets

| Metric | Target | Fail |
|--------|--------|------|
| Dashboard SSR initial load | < 1500ms | > 3000ms |
| Messages list load | < 500ms | > 1500ms |
| Realtime message delivery | < 2000ms | > 5000ms |
| Calendar view render | < 800ms | > 2000ms |
| Notification badge count | < 200ms | > 500ms |
| MV refresh post-grade | < 30s | > 120s |

---

## 7. UX CONCERNS

| Risk | Impact | Recommendation |
|------|--------|----------------|
| U1 — Dashboard cognitive overload | High | Progressive disclosure: 3 "Today's Focus" items by default; Smart Summary Card at top |
| U2 — Mobile 3-column collapse | High | Mobile-first single column, swipeable tabs, bottom nav bar, horizontal week-strip calendar |
| U3 — Notification fatigue | High | Default: badge only; daily digest email; no sound; user controls granularity; admin cannot override user mutes |
| U4 — Instructor workload not visible | High | Lead with Action Required panel: pending grades, unanswered messages >24h, next session countdown, at-risk students |
| U5 — "Course transit" jargon | Medium | Use: "In Progress", "Completed", "Coming Up", "Paused" |
| U6 — Performance anxiety from live GPA | Medium | Performance panel opt-in; default to progress bars; toggle to show grades |

### Smart Context Rules

```
STUDENT DASHBOARD — TIME-AWARE ORDERING
  Morning  (6am–12pm):  Today's Schedule → Deadlines this week → Unread messages
  Afternoon (12pm–6pm): Continue Learning → Next assignment due → Live sessions today
  Evening  (6pm–11pm):  Messages → Tomorrow's schedule → Performance summary
  No active courses:    Course catalog CTA → Announcements only

INSTRUCTOR DASHBOARD — ALWAYS
  Lead: Action Required (grading queue, unanswered messages, at-risk students)
  Live session < 2h:    Countdown timer card
  Grade < 70% + no login 7d: At-risk alert
```

---

## 8. IMPLEMENTATION PHASES

### Phase 1 — Smart Dashboard Shell + Course Transit (Weeks 1–3) CRITICAL PATH

**Week 1:** `resolveUserDashboardContext()` server fn · Role-based dashboard routing · Student / Instructor / Admin dashboard shells · Course transit states in `course_enrollments` · Mobile-first Tailwind layout

**Week 2:** CourseCard with progress bar · Last accessed indicator · Next recommended action per course · Quick-resume deep link

**Week 3:** Greeting + context-aware Smart Summary Card · `notifications` table + RLS · Bell icon with Realtime unread count · Notification dropdown · Mark read/dismiss

**Exit criteria:** Dashboard renders by DB role for all three variants. Course progress visible. No messaging yet.

---

### Phase 2 — Messaging System (Weeks 4–7)

**Week 4:** `message_threads`, `message_thread_participants`, `messages` tables · RLS + policy tests · Edge Functions: `send-message`, `create-thread`, `mark-read`

**Week 5:** Supabase Realtime channel `user:{id}:messages` · Inbox list + thread view · Message composer · Realtime delivery test

**Week 6:** Messages preview panel on dashboard · Unread badge on nav · Full-text message search · Online presence indicators

**Week 7:** Soft-delete own messages · Admin hard-delete (service_role) · Moderation flag workflow · Rate limiting · Daily digest email Edge Function

---

### Phase 3 — Announcements + Calendar (Weeks 8–10)

**Week 8:** `announcements` + `announcement_reads` tables + RLS · Composer UI for admin/instructor · Scope selector · Priority levels · Scheduled publish

**Week 9:** `calendar_events` table + `v_unified_calendar` view · `GET /api/calendar?from=&to=` · iCal export Edge Function · Timezone normalization

**Week 10:** Full calendar view (`/dashboard/calendar`) · Month/Week/Day views · Mini calendar widget (right rail) · Upcoming deadlines list · Instructor: office hours / custom events

---

### Phase 4 — Academic Performance + Analytics (Weeks 11–13)

**Week 11:** `mv_academic_performance` MV · Refresh trigger on submissions/attendance changes · `get_my_academic_performance()` + `get_course_performance()` security-definer functions · GPA computation tests

**Week 12:** Performance panel on student dashboard · Per-course grade breakdown · Progress vs grade view · Attendance summary · Opt-in toggle to show grades

**Week 13:** Instructor course analytics · At-risk student list (grade < threshold + inactivity) · Attendance compliance report · CSV export · Admin institution-wide dashboard

---

### Phase 5 — Smart Intelligence + Polish (Weeks 14–16)

**Week 14:** Time-of-day dashboard reordering · Action Required panel for instructors · Smart greeting + summary card · Auto at-risk detection + instructor notification

**Week 15:** AI weekly progress summary for students · Instructor insight: students inactive 7d · Natural language calendar query

**Week 16:** Mobile bottom navigation bar · Swipeable dashboard panels · WCAG 2.1 AA audit · Keyboard navigation · Screen reader labels

---

## 9. DECISION RECORD

```
ADR-2024-DASH-002: Smart Dashboard, Messaging, Calendar & Performance
Status: ACCEPTED
Date:   2024-06-14

D1  Server-side role resolution — dashboard variant never trusts client role claim
D2  Messaging via Edge Function gate — rate limit + sanitize + participant validate before insert
D3  Calendar as synthesized view — v_unified_calendar, no data duplication
D4  Performance via materialized view + security-definer functions — no direct MV client access
D5  Notifications decoupled from messages — unified table for all LMS event types
D6  Dashboard layout as user preference — dashboard_layout JSONB in profiles
```

### Alternatives Rejected

| Option | Reason |
|--------|--------|
| Single dashboard for all roles | Forces UX compromises across all user types; instructor needs conflict with student needs |
| Client-side role detection | Can be forged; violates security model |
| Live JOINs for performance view | Expensive at scale; blocks on every dashboard render |
| Broadcast Realtime channels | Leaks message presence data to non-participants |
| Email-only announcements | Breaks the LMS as daily habit; requires email client context-switch |

---

*CR-2024-002 | Prepared by The Architect | Status: Fully Approved*
*Priority: CRITICAL PATH — Begin Phase 1 immediately*
