# Council Review 2 — Agent 4 Feature Audit
_Date: 2026-06-23_

## ChurchCore LMS — Feature Completeness & Competitive Audit

---

### 1. Feature Phase Completion

| Phase | % Complete | Evidence / Gaps |
|-------|-----------|-----------------|
| Auth & Multi-tenancy | 95% | `profile_roles` hot-path, `platform_admins` table, lifecycle states, trigger-propagated suspension — all working. No gaps. |
| Course Building | 85% | 9 active block types, drag-and-drop, AI outline, question banks. `certificate` block `is_active: false`; SCORM `is_active: false`. |
| Student Learning | 90% | Learn page, LearningShell, BlockPlayer, progress tracking, XP/level/leaderboard. `attempts_allowed` and `minimum_grade_pct` saved but NOT enforced. |
| Assessment | 85% | Quiz auto-grading, assignment submission (text + file), teacher grading UI, feedback, XP on grade, email on grade. `attempts_allowed` and `minimum_grade_pct` have zero runtime effect. |
| HQ Governance | 90% | AI council chat, tasks, risks, decisions, weekly summary, project context — all wired. |
| Guardian Portal | 90% | Dashboard, drill-down, DB-trigger notification queue, Edge Function email via Resend. Grade notification NOT wired from `gradeSubmission`. Self-service guardian linking absent. |
| Platform Admin | 85% | Tenant CRUD, suspend/restore, health score, audit log, Stripe checkout + webhook. Plan feature flags stored but not server-enforced at route/API level. |
| Communications | 85% | Direct messages, announcements, notification bell, mark-read/dismiss. All functional. |
| AI Features | 85% | AI tutor, confusion report, related concepts, semantic search, AI analytics, weekly digest Edge Function. |
| Self-Registration | 95% | `/join/[slug]`, Turnstile bot check, `verifyAndEnroll`. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` empty = dummy widget in dev. |

---

### 2. User Type Coverage Scores

**Student — 82%**
Full enrollment → learning → submission → grading → certificate path works. XP, level, leaderboard functional. PDF certificate download works.

Gaps:
- `attempts_allowed` from QuizForm is never enforced in QuizPlayer or `submitQuiz`. Student can retry a quiz indefinitely regardless of limit.
- `minimum_grade_pct` displayed as a UI label only. A student who scores below the minimum can still advance.

**Teacher — 75%**
Course creation, builder with all active block types, question banks, AI outline generator, submissions grading UI, analytics, attendance management.

Gaps: No gradebook rollup view (only per-assignment list). No bulk grade entry. No rubric tool. No direct message-from-grading-screen.

**Admin (org-level) — 80%**
User management with invite + CSV bulk import, cohort/section/term management, org billing page, system health panel.

Gaps: Plan feature flags persist in `organizations.settings.features` and Stripe webhook updates them, but the application does NOT enforce them at route or API level — a suspended org's users see sidebar items hidden (CSS only) but can navigate directly to `/hq` or `/guardian`.

**Platform Admin — 80%**
Tenant CRUD, status transitions, Stripe lifecycle (checkout, payment_failed, subscription.deleted, subscription.updated), audit log. All idempotent via `platform_audit_log`.

Gaps: No platform-level aggregate analytics (MAU across all orgs). No tenant impersonation for support. `expire-trials` Edge Function cron schedule not confirmed in `supabase/config.toml`.

**Guardian — 75%**
Portal lists wards, drill-down shows progress/grades/certificates. Email on course completion and badge award with 30-min debounce and signed unsubscribe token.

Gaps: No notification when a grade is posted (`gradeSubmission` creates in-app notification for student, does NOT write to `guardian_notification_queue`). No self-service guardian linking — requires admin to create `guardian_links` row manually.

**Visitor (anonymous) — 90%**
`/join/[slug]` resolves by org slug, shows branding, enforces Turnstile, creates auth user + profile, redirects to `/dashboard`. Gap: no email verification before account activation.

---

### 3. Core LMS Workflows

**Course creation → publish → enrollment → lesson delivery → assessment → certificate:** PARTIAL
Works end-to-end but breaks at assessment: (1) `attempts_allowed` is ignored at runtime; (2) `minimum_grade_pct` is a display label only, not a gate.

**Self-registration → org join → course access → progress tracking:** COMPLETE

**Guardian visibility into student progress:** PARTIAL
Guardian sees progress, grades, certificates. Breaks at: (1) no notification when assignment graded; (2) cannot self-link without admin.

**Platform admin tenant activation + Stripe lifecycle:** PARTIAL
All webhook handling correct and idempotent. Breaks at: plan feature flags have no server-side enforcement layer — only sidebar CSS gating.

**AI tutor → session log → HQ weekly summary:** COMPLETE

**Teacher grades entry → student sees result → guardian notified:** PARTIAL
Teacher grades via `GradeForm` → `gradeSubmission` → in-app notification to student ✓. Guardian email NOT triggered.

---

### 4. Config-Behavior Gaps Confirmed

| Field | Saved By | Enforced By | Status |
|-------|----------|-------------|--------|
| `time_limit_minutes` | QuizForm | QuizPlayer (countdown + auto-submit) | ✅ ENFORCED |
| `bank_draws` | QuizForm | QuizPlayer (`loadQuizQuestions` → `draw_from_bank` RPC) | ✅ ENFORCED |
| `attempts_allowed` | QuizForm | Nothing | ❌ NOT ENFORCED |
| `requirements.minimum_grade_pct` | QuizForm, AssignmentForm | Nothing (UI label only) | ❌ NOT ENFORCED |
| `submission_type` | AssignmentForm | AssignmentPlayer | ✅ ENFORCED (fixed this sprint) |

---

### 5. Competitive Gaps (Top 5)

**Gap 1: No attempt limits or minimum grade gating (vs. Canvas, Moodle, TalentLMS) — CRITICAL**
A church school running a credentialing program cannot use ChurchCore LMS for assessed courses that require passing grades before advancement. Teacher-configured "2 attempts, 80% minimum" has zero runtime effect.

**Gap 2: No SCORM/xAPI support (vs. all competitors)**
`scorm` block type exists with `is_active: false`. Ministry schools purchase off-the-shelf theological training packages in SCORM format. Without this, ChurchCore LMS cannot consume any existing content library.

**Gap 3: No due date enforcement or late penalty (vs. Canvas, Moodle)**
`due_date` stored and displayed, but submissions accepted after the date with no enforcement or late penalty. The calendar module exists but has no cross-reference to assignment due dates.

**Gap 4: No discussion threading or reply notifications (vs. Canvas, Moodle, Teachable)**
DiscussionPlayer allows one reply per student. No threading, upvoting, instructor pinning, reply notification, or moderation. Community-based learning — a core church use case — is limited.

**Gap 5: Guardian self-service linking and grade notification gap (vs. PowerSchool-integrated platforms)**
No invitation flow, no self-claim link, and no notification when a grade is posted. Church schools with parent oversight cannot use the guardian system without significant staff overhead.

---

### 6. MVP Readiness Score: 68 / 100

The platform is architecturally sound. Certificate pipeline, multi-tenant RLS, Stripe lifecycle, guardian email pipeline, 9 active block types, and question bank system are all genuine differentiators.

Score held back by:
1. `attempts_allowed` and `minimum_grade_pct` saved but never enforced — makes assessment unusable for credentialing programs.
2. No server-side feature flag enforcement — Stripe subscription is cosmetic beyond `tenant_active` propagation.
3. Guardian self-service gap — continuous staff intervention required for any org with parent oversight.

**Closed-beta ready:** Yes, with one mandatory fix: enforce `attempts_allowed` in `submitQuiz`. Teachers knowing the limit isn't enforced is survivable in a supervised beta; shipping it as finished is not.

**Public launch ready:** No. Minimum bar: (1) enforce `attempts_allowed` and `minimum_grade_pct`; (2) add server-side feature gate middleware; (3) build guardian self-service invite/claim flow.

**Top 3 score movers:**
1. Enforce `attempts_allowed` and `minimum_grade_pct` in `src/app/actions/learning.ts` — unblocks primary credentialing use case, zero UI work.
2. Add server-side feature gate middleware reading `organizations.settings.features` — makes Stripe subscription meaningful.
3. Add `guardian_notification_queue` insert to `gradeSubmission` — closes the most important guardian gap with one function change.
