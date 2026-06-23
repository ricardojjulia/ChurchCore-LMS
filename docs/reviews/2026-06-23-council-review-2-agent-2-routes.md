# Council Review 2 — Agent 2 Route Audit
_Date: 2026-06-23_

## ChurchCore LMS — Route & Page Audit

### 1. Navigation Component Inventory

**Primary Navigation Sources:**

1. `src/components/layout/SidebarClient.tsx` — Main app sidebar (18 routes)
2. `src/app/platform/PlatformNav.tsx` — Platform admin nav (2 routes)
3. `src/app/(reports)/layout.tsx` — Reports role-based nav
4. `src/components/layout/MobileAdminDrawer.tsx` — Mobile admin drawer (7 routes)
5. `src/components/layout/MobileBottomNav.tsx` — Mobile bottom nav (5 routes)
6. `src/app/courses/[id]/page.tsx` — Course staff toolbar (6 dynamic links)

---

### 2. Route Status Summary

| Route | Found In | Status | Notes |
|-------|----------|--------|-------|
| /dashboard | Sidebar | EXISTS | Real page, resolves user role server-side |
| /courses | Sidebar, Mobile | EXISTS | Course listing |
| /performance | Sidebar | EXISTS | Grade/performance view |
| /reports | Sidebar | EXISTS | REDIRECTOR — routes to role-specific reports page |
| /certificates | Sidebar | EXISTS | User certificates |
| /leaderboard | Sidebar | EXISTS | Gamification leaderboard (gated: leaderboard feature) |
| /messages | Sidebar, Mobile | EXISTS | Messaging/threads |
| /announcements | Sidebar, Mobile | EXISTS | Course announcements |
| /calendar | Sidebar, Mobile | EXISTS | Calendar view |
| /my-groups | Sidebar | EXISTS | User groups/cohorts |
| /guardian | Sidebar | EXISTS | Guardian portal (guardianOnly + gated) |
| /hq | Sidebar | EXISTS | HQ governance (staffOnly + gated) |
| /profile | Sidebar | EXISTS | User profile management |
| /admin/users | Sidebar, Mobile | EXISTS | User management |
| /admin/cohorts | Sidebar, Mobile | EXISTS | Cohort/class management |
| /admin/sections | Sidebar, Mobile | EXISTS | Academic section management |
| /admin/terms | Sidebar, Mobile | EXISTS | Academic term management |
| /admin/program-tracks | Sidebar | EXISTS | Program track management |
| /admin/blueprints | Sidebar | EXISTS | Course blueprint templates |
| /admin/ai-analytics | Sidebar | EXISTS | AI tutor analytics (gated: ai_tutor) |
| /admin/billing | Sidebar, Mobile | EXISTS | Stripe billing portal |
| /admin/health | Sidebar, Mobile | EXISTS | System health checks |
| /admin/badges | Not in sidebar | EXISTS | Badge management (accessible, not nav-linked) |
| /admin/question-banks | Not in sidebar | EXISTS | Question bank management |
| /platform | Sidebar | EXISTS | Platform admin tenants |
| /platform/audit | PlatformNav | EXISTS | Platform audit log |
| /student/reports | ReportsNav | EXISTS | Student performance reports |
| /instructor/reports | ReportsNav | EXISTS | Instructor gradebook/analytics |
| /admin/reports | ReportsNav | EXISTS | Admin dashboard reports |
| /courses/new | Courses page | EXISTS | Create new course |
| /courses/[id] | Courses page | EXISTS | Course detail view |
| /courses/[id]/build | Course detail | EXISTS | Course builder/editor |
| /courses/[id]/analytics | Course detail | EXISTS | Course enrollment analytics |
| /courses/[id]/submissions | Course detail | EXISTS | Assignment submissions view |
| /courses/[id]/enroll | Course detail | EXISTS | Course enrollment management |
| /courses/[id]/pages | Course detail | EXISTS | Course pages/resources |
| /courses/[id]/attendance | Course detail | EXISTS | Attendance tracking |
| /courses/[id]/edit | Course detail | EXISTS | Course metadata editor |
| /courses/[id]/learn | Course detail CTA | EXISTS | Student learning experience |
| /courses/[id]/complete | Completion flow | EXISTS | Course completion handler |
| /courses/[id]/pages/[pageId]/edit | Pages management | EXISTS | Edit course page content |
| /courses/[id]/tutor | Tutor/AI | EXISTS | AI tutor interface |
| /admin/cohorts/[id] | Cohorts | EXISTS | Cohort detail/edit |
| /admin/cohorts/[id]/enroll | Cohort detail | EXISTS | Cohort enrollment |
| /admin/sections/[id] | Sections | EXISTS | Section detail/edit |
| /admin/terms/[id] | Terms | EXISTS | Term detail/edit |
| /admin/program-tracks/[id] | Tracks | EXISTS | Track detail/edit |
| /admin/blueprints/[id] | Blueprints | EXISTS | Blueprint detail/edit |
| /admin/question-banks/[id] | Question banks | EXISTS | Bank detail/edit |
| /admin/users/[id] | Users page | EXISTS | User profile (admin view) |
| /admin/users/import | Users page | EXISTS | Bulk user import |
| /platform/tenants/new | Platform | EXISTS | Create new tenant |
| /platform/tenants/[id] | Platform | EXISTS | Tenant detail/edit |
| /platform/tenants/[id]/billing | Billing link | EXISTS | Tenant billing |
| /join/[slug] | Self-registration | EXISTS | Public registration link |
| /(auth)/login | App root | EXISTS | Authentication page |
| /onboarding | Auth redirect | EXISTS | Onboarding placeholder |

**Total routes audited:** 54+  
**Existing pages:** 54 (100%)  
**Stub/redirector pages:** 1 (/reports)  
**Missing pages:** 0  
**Broken href links:** 0

---

### 3. API Routes Completeness

**Routes with verified client callers:**
- `/api/search` — GlobalSearch component + e2e tests
- `/api/health` — SystemHealthPanel
- `/api/calendar` — CalendarView
- `/api/reports/artifacts` — useReportsDrawer hook
- `/api/ai/tutor` — TutorChat component
- `/api/ai/confusion-topics` — ConfusionReport component
- `/api/ai/weekly-summary` — AiWeeklySummary component
- `/api/ai/related-concepts` — RelatedConceptsPanel component
- `/api/ai/outline-generator` — OutlineGeneratorModal component
- `/api/ai` — HQ page
- `/api/stripe/create-checkout` — BillingPageClient, BillingActions
- `/api/stripe/portal` — BillingPageClient
- `/api/stripe/webhook` — Stripe (external caller)
- `/api/upload/image` — RichTextEditor
- `/api/certificates/[id]/pdf` — Certificates page

**Orphaned API route (no client caller found):**
- **`/api/analytics/events`** — POST endpoint defined but never called from any frontend component

**External callers (non-frontend):**
- `/api/digest` — Vercel cron job (documented in vercel.json)
- `/api/guardian/unsubscribe` — Email link

---

### 4. Notable Observations

1. Route grouping: `/(auth)` grouped route correctly handles both `/login` and `/auth/login` URLs.
2. Feature gating: 5 sidebar routes use `featureGate` to conditionally show based on org settings.
3. `/admin/badges` and `/admin/question-banks` exist but are intentionally not in the sidebar nav.
4. All `/courses/[id]/*` dynamic routes verified to exist.
