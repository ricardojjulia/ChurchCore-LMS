# Council Review 1 — Agent 2: Route & Page Audit
**Date:** 2026-06-20

## ChurchCore LMS Route & Page Audit

### Summary

| Metric | Count |
|--------|-------|
| Routes audited | 40+ |
| Pages EXISTS | 40 |
| Pages MISSING | 0 |
| STUB (intentional redirect) | 1 (`/reports`) |
| Orphaned API calls | 0 |
| Broken nav links | 0 |

### Main Navigation Routes (SidebarClient.tsx)

| Route | Found In | Status | Notes |
|-------|----------|--------|-------|
| /dashboard | SidebarClient.tsx | EXISTS | Role-based rendering |
| /courses | SidebarClient.tsx | EXISTS | Paginated with track grouping |
| /performance | SidebarClient.tsx | EXISTS | Grades & analytics |
| /reports | SidebarClient.tsx | STUB | Role-gate redirect — intentional |
| /certificates | SidebarClient.tsx | EXISTS | Certificate listing |
| /leaderboard | SidebarClient.tsx | EXISTS | XP-based ranking |
| /messages | SidebarClient.tsx | EXISTS | Message threads |
| /announcements | SidebarClient.tsx | EXISTS | Announcements with read status |
| /calendar | SidebarClient.tsx | EXISTS | Event calendar |
| /my-groups | SidebarClient.tsx | EXISTS | Group listing & detail |
| /guardian | SidebarClient.tsx | EXISTS | Guardian portal |
| /hq | SidebarClient.tsx | EXISTS | AI council governance |
| /profile | SidebarClient.tsx | EXISTS | User profile form |

### Admin Routes

| Route | Status | Notes |
|-------|--------|-------|
| /admin/users | EXISTS | User management |
| /admin/cohorts | EXISTS | Cohort list + detail |
| /admin/sections | EXISTS | Sections CRUD |
| /admin/terms | EXISTS | Academic terms |
| /admin/program-tracks | EXISTS | Program track definitions |
| /admin/blueprints | EXISTS | Course blueprint templates |
| /admin/ai-analytics | EXISTS | AI tutor usage analytics |
| /admin/health | EXISTS | System health dashboard |

### Platform Admin Routes

| Route | Status | Notes |
|-------|--------|-------|
| /platform | EXISTS | Tenant listing with health scores |
| /platform/audit | EXISTS | Platform audit log |
| /platform/tenants/[id] | EXISTS | Tenant detail |
| /platform/tenants/[id]/edit | EXISTS | Tenant configuration |
| /platform/tenants/[id]/billing | EXISTS | Stripe billing management |
| /platform/tenants/new | EXISTS | Create new tenant |

### Course Dynamic Routes

| Route | Status |
|-------|--------|
| /courses/[id] | EXISTS |
| /courses/[id]/learn | EXISTS |
| /courses/[id]/pages | EXISTS |
| /courses/[id]/pages/[pageId]/edit | EXISTS |
| /courses/[id]/build | EXISTS |
| /courses/[id]/edit | EXISTS |
| /courses/[id]/analytics | EXISTS |
| /courses/[id]/submissions | EXISTS |
| /courses/[id]/complete | EXISTS |
| /courses/[id]/enroll | EXISTS |
| /courses/[id]/tutor | EXISTS |
| /courses/new | EXISTS |

### API Routes — All Verified

All 16 client-facing API endpoints have confirmed corresponding server handlers. No orphaned calls found.

### Key Observations

- No 404 routes anywhere in primary navigation
- `/reports` is an intentional role-gate stub — correct pattern
- Feature-gated routes (`/leaderboard`, `/guardian`, `/hq`, `/admin/ai-analytics`) all gated by `organizations.settings.features` and role checks
- All dynamic `[id]` segments use proper `notFound()` on missing records
