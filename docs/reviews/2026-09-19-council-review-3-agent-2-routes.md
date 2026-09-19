# Council Review 3 — Agent 2: Route & Page Audit

**Date:** 2026-09-19 · **Branch:** codex/oneroster-verification-refresh

---

## Summary

**Total Routes Checked**: 71 main routes + dynamic variants
**Status**: 2 MISSING routes, 69 EXISTS routes
**Critical Issues**: 35+ files redirect to non-existent `/auth/login` instead of `/login` — **confirmed independently during synthesis** (`grep -rl "redirect('/auth/login')" src/app` → 35 files).

---

## Navigation Components Inventory

- `src/app/layout.tsx` — renders Sidebar, MobileBottomNavServer, MobileAdminDrawerServer
- `src/components/layout/SidebarClient.tsx` — main navigation (25 routes)
- `src/components/layout/MobileBottomNav.tsx` — mobile nav (5 routes)
- `src/components/layout/MobileAdminDrawer.tsx` — mobile admin drawer (9 routes)
- `src/app/platform/PlatformNav.tsx` — platform admin nav (3 routes)
- `src/app/(reports)/ReportsNav.tsx` — reports by role (3 routes, hash-based)

## Page Existence Check

**EXISTS (69 routes)** — all top-level nav destinations, admin CRUD pages, course sub-routes ([id]/learn, /build, /analytics, /submissions, /attendance, /enroll, /complete, /edit, /pages, /pages/[pageId], /pages/[pageId]/edit, /tutor), platform tenant management, guardian/[studentId], my-groups/[groupId] all confirmed present with real content.

**MISSING (2 routes)**:

| Route | Found In | Issue |
|---|---|---|
| `/admin/question-banks/new` | `src/app/admin/question-banks/page.tsx:65` | Button links to create new bank, but no page.tsx exists — 404. |
| `/auth/login` | 35 files, e.g. `src/app/courses/page.tsx:53` | `redirect('/auth/login')` called instead of `/login`. Middleware allows `/auth/*` through, so the request reaches Next.js routing and 404s. |

## API Route Completeness

28 API routes verified against every fetch call site — **no orphaned API calls detected**. 14 server action files, all resolve correctly.

## Link Consistency — `/auth/login` Bug

Root cause: the `(auth)` layout group maps URL `/login` to `(auth)/login/page.tsx`. 35 files across admin, course, calendar, and other server components incorrectly call `redirect('/auth/login')` instead of `redirect('/login')`. `middleware.ts` only ever redirects to `/login` (line 63) — these are separate, incorrect calls scattered through page-level auth guards.

## Recommendations (as originally reported)

1. Replace all `redirect('/auth/login')` with `redirect('/login')` — 35 files.
2. Create `src/app/admin/question-banks/new/page.tsx` or remove the link.
3. All API routes and server actions are healthy.
