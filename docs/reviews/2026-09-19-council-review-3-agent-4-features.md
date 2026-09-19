# Council Review 3 — Agent 4: Feature Completeness & Competitive Audit

**Date:** 2026-09-19 · **Branch:** codex/oneroster-verification-refresh · **Version:** 0.28.x

---

## 1. Feature Phase Completion

| Phase | % Complete | Evidence |
|---|---|---|
| Auth & Multi-tenancy | 95% | `supabase/migrations/20260618200000_platform_admins.sql`, `20240601000014_fix_rls_recursion.sql` |
| Course Building | 90% | `src/app/courses/[id]/build/page.tsx`, `src/components/builder/CourseBuilder.tsx` |
| Student Learning | 85% | `src/app/courses/[id]/learn/page.tsx`, `src/components/learning/LearningShell.tsx` |
| Assessment | 80% | `src/app/courses/[id]/submissions/page.tsx`, `src/app/certificates/page.tsx`, `src/app/api/certificates/[id]/pdf/route.ts` |
| HQ Governance | 90% | `src/app/hq/page.tsx`, `src/app/api/ai/weekly-summary/route.ts` |
| Guardian Portal | 75% | `src/app/guardian/page.tsx`, `src/app/guardian/[studentId]/page.tsx`, `supabase/migrations/20260620100000_guardian_notification_queue.sql` |
| Platform Admin | 80% | `src/app/platform/page.tsx`, `.../billing/page.tsx`, `.../audit/page.tsx` |
| Communications | 80% | `src/app/messages/page.tsx`, `src/app/notifications/page.tsx`, `src/app/announcements/` |
| AI Features | 85% | `src/app/courses/[id]/tutor/page.tsx`, `src/components/ai/TutorChat.tsx` |
| Self-Registration | 85% | `src/app/join/[slug]/page.tsx`, `src/app/join/actions.ts` |

Stripe checkout/webhook wired. OneRoster staging/apply/identity-linking/bulk reconciliation complete. Reporting (admin/instructor/student + PDF export) complete.

## 2. User Type Coverage

- **Student — 80%**: full LearningShell, all block types, grades, certificates, XP/leaderboard. Missing: public catalog self-enrollment, waitlist visibility, SSO.
- **Teacher — 75%**: full CourseBuilder, publishing, submissions/grading, per-course analytics. Missing: holistic gradebook grid, rubric grading, bulk grade entry.
- **Admin (org) — 80%**: user invite/CSV import, cohort/academic structure management, org reports, billing. Missing: user deactivation UI, role-change confirmation flow.
- **Platform Admin — 75%**: full tenant lifecycle, billing, audit log, demo login. Bootstrap is migration-only (correct per ADR). Missing: cross-tenant analytics, health-score algorithm is simplistic.
- **Guardian — 70%**: ward progress/grades/certificates on detail page. Missing: notification preference UI, confirmed Resend delivery, direct teacher messaging.
- **Visitor — 80%**: `/join/[slug]` branded registration with Turnstile. Missing: public course catalog/preview, payment-gated registration.

## 3. Core LMS Workflows

- **Course creation → certificate**: 90% mechanically complete; certificate-issuance trigger pathway needs confirmation.
- **Self-registration → enrollment**: Partial — **no auto-enrollment after join; new student lands on an empty dashboard.** Most broken end-user flow for church adoption.
- **Guardian visibility**: Partial — notification queue creates entries on grade events, but Resend delivery pipeline unverified; no guardian preference UI.
- **Platform tenant + Stripe lifecycle**: Partial — checkout/webhook wired; `customer.subscription.deleted` suspension path needs verification.
- **AI tutor → HQ weekly summary**: Partial — persistence and routes exist; trigger/confirmation UI unclear.
- **Grades → guardian notified**: Partial — same Resend-delivery gap as guardian visibility above.

## 4. Competitive Gaps

1. **No holistic gradebook grid** — vs. Canvas/Moodle/TalentLMS/Schoology. Highest-friction teacher gap once a course exceeds ~15 students.
2. **No public course catalog/landing pages** — vs. Teachable/Thinkific/Kajabi/TalentLMS. Blocks outreach use case ("take our free Bible study").
3. **No SCORM/xAPI support** — vs. Canvas/Moodle/TalentLMS/Absorb. **Note: already deliberately deferred per ADR-2026-006, gated on a customer contract trigger — not a new finding, restates existing governance.**
4. **No automated enrollment trigger on registration** — hard blocker for onboarding dozens of students at once.
5. **No direct teacher↔guardian messaging** — thread system exists but not connected to the guardian role.

## 5. MVP Readiness Score

**83/100** (up from Sprint 1's 78/100). Core LMS loop functionally complete, RLS sound, governance mature. Held back by: (1) unverified email delivery pipeline, (2) no public course catalog, (3) no gradebook grid.

**Closed-beta ready**: Yes, with: confirmed Resend delivery (one live guardian round-trip), confirmed digest cron schedule, functional onboarding checklist, one complete org walkthrough.

**Public launch ready**: No — needs public catalog, auto-enrollment, gradebook grid, confirmed email delivery across all notification types, self-serve tenant signup.

**Top 3 moves**: (1) public course catalog, (2) automated enrollment on registration, (3) gradebook grid.
