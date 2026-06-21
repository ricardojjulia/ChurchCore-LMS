# Council Review 1 — Agent 4: Feature & Competitive Audit
**Date:** 2026-06-20

## ChurchCore LMS — Feature Completeness and Competitive Audit

### 1. Feature Phase Completion

| Phase | % Complete | Key Evidence | Gap |
|-------|-----------|--------------|-----|
| Auth & Multi-tenancy | 92% | 46 tables isolated, `is_platform_admin()`, `tenant_active`, feature flags | No COPPA consent gate; no GDPR right-to-erasure on tenant purge |
| Course Building | 95% | `CourseBuilder`, `BlockPlayer`, all block types incl. video | No bulk block import |
| Student Learning | 95% | `LearningShell`, `QuizPlayer`, `AssignmentPlayer`, `DiscussionPlayer`, `TutorChat` | No PWA/offline mode |
| Assessment | 90% | Submissions, `GradeForm`, `generate-certificate` Edge Function, XP/badges | No rubric-based grading; no peer review |
| HQ Governance | 88% | Full `/hq/page.tsx` with all 4 entity types, org-scoped RLS | No URL-persistent state for individual HQ items |
| Guardian Portal | 85% | `/guardian/` and `/guardian/[studentId]/` confirmed | No guardian self-link request; no email notifications to guardian |
| Platform Admin | 90% | Tenant CRUD, billing UI, audit log, health score, CI/CD | No impersonation mode; no GDPR export; staging env not provisioned |
| Communications | 88% | Messages, announcements, calendar, notifications, realtime, digest API | `weekly-digest` opt-in preference gate not verified end-to-end |
| AI Features | 90% | Streaming tutor, rate limiting, vector search, embeddings, no PII in prompts | No response body logging in `ai_query_log` (only query hash) |
| Self-Registration | 90% | `/join/[slug]` + Turnstile + `verifyAndEnroll` + org branding | `handle_new_user` trigger `org_id` integration requires live verification |

### 2. User Type Coverage

| Role | Score | Key Gap |
|------|-------|---------|
| Student | 88% | No PWA; badge award not wired to notification system |
| Teacher | 85% | No rubric builder; no cohort-targeted announcements |
| Admin (org-level) | 82% | No bulk user CSV import; no org-level self-serve billing |
| Platform Admin | 87% | No impersonation; no GDPR export; staging not provisioned |
| Guardian | 65% | No email notifications; no self-service link request |
| Visitor (anonymous) | 75% | No public course catalog preview beyond join form |

### 3. Core LMS Workflows

| Workflow | Status | Notes |
|----------|--------|-------|
| Course create → publish → enroll → learn → grade → certificate | Complete | Every step confirmed including `generate-certificate` Edge Function |
| Self-registration → org join → course access | Partial | `/join/[slug]` confirmed; `handle_new_user` org_id integration requires live env test |
| Guardian visibility into student progress | Partial | Read-only confirmed; guardian email notification bridge not built |
| Platform admin tenant activation + Stripe billing | Complete | Webhook idempotency, checkout, plan mapping all confirmed |
| AI tutor → session log → weekly summary | Partial | Tutor + `ai_query_log` confirmed; weekly digest opt-in gate not verified end-to-end |
| Teacher grade entry → student result → guardian notified | Partial | Grade entry and student view confirmed; guardian notification absent |

### 4. Competitive Gaps (5 Critical)

**1. No mobile/PWA experience**
No `manifest.json`, no service worker, no offline course player. Ministry Grid and RightNow Media have native mobile. Church staff and youth ministers learn on phones. This is the distribution gap most likely to stall a pilot. A PWA with offline caching would require ~3 days. Without it, ChurchCore LMS cannot compete for "staff training on the go."

**2. No bulk user CSV import**
Every competitor (Canvas, Moodle, TalentLMS, Teachable) accepts CSV. ChurchCore requires admin-by-admin invitation. A church with 200 members in a new-member class cannot onboard via manual invite. This is a Day 1 blocker for any org above 20 people. Data model supports it; the route does not exist.

**3. Guardian notification bridge is half-built**
Guardian portal shows read-only data. Guardians receive no email when ward completes a course, earns a badge, or falls behind. COUNCIL-2025-016 identified this as a competitive moat — it is unbuilt. A guardian who must log in to check progress stops checking within two weeks.

**4. No graded discussion type**
`DiscussionPlayer` and `section_groups`/`group_posts` exist but discussion is not wired to `block_submissions` or the grading pipeline. Canvas and Moodle both support graded discussions as first-class assessment. For adult formation and seminary-style use cases (which the academic structure serves), discussion is often the primary form of assessment.

**5. No org-level self-serve billing**
Org admins cannot see or manage their subscription. Billing lives entirely in the platform admin console. Every SaaS competitor lets org admins see their plan, upgrade, download invoices, and cancel. ChurchCore requires contacting the platform admin for any billing action — does not scale past a handful of tenants.

### 5. MVP Readiness Score

**78 / 100**

The core learning loop (course build → enroll → learn → grade → certificate) is production-grade. Multi-tenant RLS across 46 tables is more rigorous than any open-source church LMS. AI tutor with vector search, rate limiting, and PII hygiene is a real technical moat. Platform admin console with Stripe is wired. CI/CD, CSP, Sentry, and storage RLS are confirmed. This is not a prototype.

The gap between 78 and 90 is product finishing work: guardian email bridge, bulk user import, mobile/PWA, org self-serve billing, and graded discussion. None require architectural redesign.

**Closed-beta ready** (today, for 3–5 hand-invited orgs):
- Resend SMTP configured in Supabase Auth dashboard
- `UPSTASH_REDIS_REST_*` and `STRIPE_*` set in Vercel
- `handle_new_user` trigger verified to write `org_id` from `raw_user_meta_data`

**Public launch ready** (estimated 3–4 engineering weeks):
1. Bulk user CSV import
2. Org-level self-serve billing page
3. PWA manifest + offline course player
4. Guardian email notifications
5. Graded discussion block connected to gradebook
6. Dual-org seed data enabling RLS penetration tests to run in CI

**Top 3 score movers:** Guardian email bridge (+5), bulk user import (+4), PWA/offline (+6)
