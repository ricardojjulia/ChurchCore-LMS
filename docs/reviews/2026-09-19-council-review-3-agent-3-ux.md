# Council Review 3 — Agent 3: UX & Shell Quality Audit

**Date:** 2026-09-19 · **Branch:** codex/oneroster-verification-refresh

**Overall: B+ (80/100)**

---

## 1. ARIA Correctness — PASS

No critical issues. `aria-current="page"` correctly boolean (not string) on all active nav items (SidebarClient, PlatformNav, MobileBottomNav, MobileAdminDrawer). All modals have `role="dialog"` + `aria-modal="true"` + label (GlobalSearch, NotificationBell, MobileAdminDrawer, ReportsDrawer). Icon-only buttons have `aria-label`. Decorative SVGs `aria-hidden="true"`. Focus management: Escape closes modals, focus trap in ReportsDrawer.

## 2. Loading & Empty States — CRITICAL GAPS

**Present**: `/admin/*` (users, cohorts, sections, terms, blueprints, program-tracks, billing), `/courses`, `/dashboard`, `/profile`, `/performance`, `/messages` all have `loading.tsx`.

**Missing**:
- `/platform` — no `loading.tsx` → blank screen for admins on slow connections (HIGH)
- `/guardian` — no `loading.tsx` → blank screen loading student overviews
- `/hq` — client component loads large AI model context synchronously (MEDIUM)

**Empty states**: all PASS — platform, courses, certificates, student reports, guardian (proper `notFound()`), HQ (chat/decisions/risks) all handled. All `.map()` calls null-guarded with `?? []`.

## 3. CSS & Style Completeness — ONE CRITICAL GAP

Globals CSS has brand tokens, dark mode, WCAG AA focus rings, safe-area support, no `.input`/`.btn` collisions. Responsive breakpoints used consistently; tables have `overflow-x-auto` on 12 pages.

**Critical gap**: no `@media print` anywhere. Certificates page has a PDF download link but no print stylesheet; reports pages have export buttons but no print-optimized layout. Browser print (Cmd+P) breaks the layout (nav, colors, backgrounds render incorrectly on paper).

## 4. Shell Nav Active State — PASS

Consistent `usePathname()` + `aria-current="page"` pattern across all five nav shells (Sidebar, Platform, MobileBottomNav, MobileAdminDrawer, ReportsNav).

## 5. Error Handling — MOSTLY GOOD

**Present**: root `error.tsx` + `not-found.tsx`; segment-level `error.tsx` for `/admin`, `/courses`, `/dashboard`, `/platform`, `/(reports)`.

**Missing**: `/guardian` (MEDIUM — falls back to default Next.js error page), `/hq` (client component, would improve resilience).

API error handling PASS — Stripe webhook returns generic errors, never raw DB errors; idempotency check present; audit logging present. No PII or stack traces leaked.

## Top 3 UX Pain Points (as originally reported)

1. **Missing `@media print` (HIGH)** — certificates/transcripts/reports unprintable without broken layout.
2. **Missing `loading.tsx` for `/platform` (MEDIUM-HIGH)** — blank screen on slow connections during tenant management.
3. **Missing `error.tsx` for `/guardian` (MEDIUM)** — default Next.js error page instead of a friendly one.

## Summary Table

| Category | Status |
|---|---|
| ARIA | PASS |
| Loading states | PARTIAL — platform, guardian, hq missing |
| Empty states | PASS |
| Data null guards | PASS |
| CSS completeness | PARTIAL — print media missing |
| Nav active state | PASS |
| Error boundaries | PARTIAL — guardian, hq missing |
| API error handling | PASS |
