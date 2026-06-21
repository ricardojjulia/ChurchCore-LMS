# Council Review 1 — Agent 3: UX & Shell Audit
**Date:** 2026-06-20

## UX and Shell Quality Audit — ChurchCore LMS

### 1. ARIA Correctness

**CRITICAL: String-cast ARIA attributes**
- `src/components/cohorts/UserSearchCombobox.tsx` lines 106, 169: `aria-expanded` and `aria-selected` use TypeScript assertion `as 'true' | 'false'` — functionally correct at runtime but semantically wrong
- `src/components/layout/NotificationBell.tsx` line 75: same `aria-expanded` pattern

**CRITICAL: Missing `aria-current="page"` on primary sidebar nav**
- `src/components/layout/SidebarClient.tsx` lines 69–114: computes `active` state, applies visual style (`bg-slate-800`), but does NOT set `aria-current="page"` on active items
- Screen reader users cannot identify current page

**Positive:**
- Mobile bottom nav correctly uses `aria-current="page"` (`MobileBottomNav.tsx` line 83) ✓
- Learning module nav uses `aria-current="page"` (`LearningShell.tsx` line 314) ✓
- Modals use `role="dialog"` + `aria-modal="true"` (GlobalSearch, NotificationBell, MobileAdminDrawer) ✓
- Icon-only buttons have `aria-label` throughout ✓

### 2. Loading and Empty States

**Missing loading.tsx (co-located):**
- `src/app/admin/cohorts/` — no loading.tsx
- `src/app/admin/sections/` — no loading.tsx
- `src/app/admin/terms/` — no loading.tsx
- `src/app/admin/blueprints/` — no loading.tsx
- `src/app/admin/program-tracks/` — no loading.tsx
- `src/app/courses/[id]/analytics/` — no loading.tsx
- `src/app/courses/[id]/submissions/` — no loading.tsx
- `src/app/guardian/[studentId]/` — no loading.tsx
- `src/app/(reports)/` segments — no segment-level loading.tsx
- `src/app/platform/` pages — no loading.tsx

**Empty state handling — good:**
- `/courses/page.tsx` line 278–293: `filtered.length === 0` handled ✓
- `/admin/cohorts/page.tsx` line 56: `!cohorts || cohorts.length === 0` ✓
- `/guardian/page.tsx` line 53–60: empty state with CTA ✓
- All `.map()` calls use `?? []` null guards throughout ✓

### 3. CSS Completeness

- `src/app/globals.css` present
- Responsive breakpoints (`md:`, `lg:`, `sm:`) used in layouts ✓
- Mobile bottom nav hidden on desktop with `md:hidden` ✓
- **MISSING: `@media print`** — no print styles for certificate or transcript views
- Platform tables have no `overflow-x-auto` wrapper (see Section 5)

### 4. Shell Nav Active State

| Nav Component | usePathname? | aria-current="page"? | Status |
|---|---|---|---|
| `SidebarClient.tsx` | Yes | **NO** | BUG |
| `MobileBottomNav.tsx` | Yes | Yes | OK |
| `MobileAdminDrawer.tsx` | Yes | **NO** | BUG |
| `platform/layout.tsx` NavLink | **No** | **NO** | BUG |
| `(reports)/layout.tsx` NavLink | **No** | **NO** | BUG |

Platform nav and reports nav have no active state at all — neither visual nor semantic.

### 5. Error Handling

**Error boundaries present:**
- `src/app/error.tsx` ✓
- `src/app/admin/error.tsx` ✓
- `src/app/courses/error.tsx` ✓
- `src/app/courses/[id]/error.tsx` ✓
- `src/app/courses/[id]/learn/error.tsx` ✓
- `src/app/dashboard/error.tsx` ✓
- `src/app/not-found.tsx` ✓

**Missing error boundaries:**
- `src/app/platform/error.tsx` — MISSING
- `src/app/(reports)/error.tsx` — MISSING

**Security risk:**
- `src/app/admin/users/page.tsx` line 61–66: renders `{error.message}` directly in UI — may expose raw Supabase/Postgres error strings to org admins

### 6. Top 3 UX Pain Points

**1. Sidebar active state not announced to screen readers** — `src/components/layout/SidebarClient.tsx`
Active link is visually styled but `aria-current` is absent. Screen reader users cannot hear which page is current.
**Severity: HIGH** — Fix: `aria-current={active ? 'page' : undefined}` on the Link element.

**2. Platform admin tables overflow on mobile** — `src/app/platform/page.tsx` line 111–112
8-column tenant table has no `overflow-x-auto` wrapper. Breaks entirely on screens < 640px.
**Severity: HIGH** — Fix: wrap in `<div className="overflow-x-auto">`.

**3. Reports sidebar has no active state** — `src/app/(reports)/layout.tsx` lines 86–96
Fragment anchors (`#certificates`, `#download`) don't navigate. No visual or semantic active state. Users cannot tell which report section they are viewing.
**Severity: MEDIUM** — Fix: use `usePathname()` + border-l-2 highlight + `aria-current="page"`.
