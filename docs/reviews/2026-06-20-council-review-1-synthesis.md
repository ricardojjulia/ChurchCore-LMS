# Council Review 1 — Synthesis
**Date:** 2026-06-20
**MVP Score:** 78 / 100
**Closed-beta:** Ready (3 env vars needed)
**Public launch:** ~3–4 engineering weeks

---

## Cross-Agent Consensus

Findings flagged independently by two or more agents:

### Consensus 1 — Seed data cannot support RLS penetration tests
**Flagged by:** Agent 1 (state), Agent 4 (features)
`supabase/seed.test.sql` creates users without org_id context. 30 tables added in Phase 2 require org_id. The RLS isolation test file at `src/tests/e2e/rls-isolation.test.ts` exists but will fail without seeded dual-org data. This is the single most important blocker for public launch CI confidence.
**Priority: HIGH**

### Consensus 2 — Guardian notification bridge is half-built
**Flagged by:** Agent 3 (UX — implied), Agent 4 (features — explicit)
Guardian portal shows read-only data. No email notifications sent when ward completes a course, earns a badge, or falls behind. COUNCIL-2025-016 identified this as a competitive moat. It is unbuilt. A guardian who must log in to check progress stops checking.
**Priority: HIGH**

### Consensus 3 — Navigation `aria-current="page"` missing in 3 of 5 nav systems
**Flagged by:** Agent 3 (UX), corroborated by Agent 2 (route audit confirmed all pages exist, so the gap is purely the semantic layer)
Sidebar (`SidebarClient.tsx`), mobile admin drawer (`MobileAdminDrawer.tsx`), platform nav (`platform/layout.tsx`), and reports nav (`(reports)/layout.tsx`) all lack `aria-current="page"`. Only `MobileBottomNav.tsx` does this correctly. Screen reader users cannot identify their current page in the primary navigation.
**Priority: HIGH** → ADR-2026-002 drafted

### Consensus 4 — Error boundaries missing at /platform/ and /(reports)/
**Flagged by:** Agent 3 (UX), applicable to Agent 1's API route observations
Both route groups have layouts but no `error.tsx`. Any unhandled server component error in the platform admin console or reports views falls through to the root boundary with no context-appropriate recovery.
**Priority: MEDIUM** → ADR-2026-001 drafted

---

## ADR Drafts

Two ADRs have been committed:
- **ADR-2026-001** (`docs/decisions/ADR-2026-001.md`) — Error boundary strategy: every top-level route group with a layout must have a co-located `error.tsx`; `error.message` must never render in the DOM
- **ADR-2026-002** (`docs/decisions/ADR-2026-002.md`) — Navigation active state contract: all nav components must use `usePathname()` + `aria-current={active ? 'page' : undefined}`; mobile bottom nav is the canonical pattern

---

## Implementation Prompts

### Sprint 1 — Shell & Accessibility (independent, can run in parallel)

---

## Prompt A — Navigation aria-current

**ADR Reference:** ADR-2026-002
**Files:** `src/components/layout/SidebarClient.tsx`, `src/components/layout/MobileAdminDrawer.tsx`, `src/app/platform/layout.tsx`, `src/app/(reports)/layout.tsx`
**Scope:** Add `aria-current={active ? 'page' : undefined}` to the active `<Link>` in four nav components. Add `usePathname()` to the two components that currently lack it (`platform/layout.tsx` and `(reports)/layout.tsx`). Add `aria-label` to each `<nav>` wrapper.

**Work:**
1. In `SidebarClient.tsx`: add `aria-current={active ? 'page' : undefined}` to the `<Link>` at line ~83. No other changes.
2. In `MobileAdminDrawer.tsx`: same — add `aria-current` to active link, confirm `usePathname()` is already imported.
3. In `platform/layout.tsx`: import `usePathname` from `'next/navigation'`, make NavLink a client component, compute `active = pathname === href || pathname.startsWith(href + '/')`, add `aria-current` and visual active class.
4. In `(reports)/layout.tsx`: same pattern. Replace fragment anchors (`#`) with real href paths if they navigate to sub-pages.
5. Add `aria-label="Main navigation"` / `"Platform navigation"` / `"Reports navigation"` to each `<nav>` element.

**Security:** No auth changes. Navigation is UI-only.

**Verification:**
- `npm run typecheck`
- `npm run lint`
- Manual: open each shell, tab through nav with keyboard, confirm screen reader announces "current page"

---

## Prompt B — Error Boundaries at /platform/ and /(reports)/

**ADR Reference:** ADR-2026-001
**Files:** `src/app/platform/error.tsx` (new), `src/app/(reports)/error.tsx` (new)
**Scope:** Add `error.tsx` at two missing layout levels. Each must follow the ADR-2026-001 contract: `'use client'`, never expose `error.message`, call `Sentry.captureException`, render a context-appropriate recovery action.

**Work:**
1. Create `src/app/platform/error.tsx`:
   ```tsx
   'use client'
   import { useEffect } from 'react'
   import * as Sentry from '@sentry/nextjs'
   export default function PlatformError({ error, reset }: { error: Error; reset: () => void }) {
     useEffect(() => { Sentry.captureException(error) }, [error])
     return (
       <div className="p-8 text-center">
         <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
         <p className="text-muted-foreground mb-4">The platform console encountered an error.</p>
         <button onClick={reset} className="btn-primary">Try again</button>
       </div>
     )
   }
   ```
2. Create `src/app/(reports)/error.tsx` with equivalent content ("The reports page encountered an error.").

**Security:** No auth changes. Errors are logged to Sentry only, never rendered.

**Verification:**
- `npm run typecheck`
- `npm run lint`

---

## Prompt C — Fix Raw Error Exposure in admin/users

**ADR Reference:** ADR-2026-001 (error contract)
**Files:** `src/app/admin/users/page.tsx`
**Scope:** Line 61–66 renders `{error.message}` directly in the UI. Replace with a generic message. Log the original error to console only in development.

**Work:**
1. Locate the error render block at lines 61–66.
2. Replace `{error.message}` with a safe generic string: `"Failed to load users. Please try again or contact support."`
3. Add `if (process.env.NODE_ENV !== 'production') console.error(error)` before the return.

**Security:** Prevents schema/DB error string leakage to org admins.

**Verification:**
- `npm run typecheck`
- Manually trigger an error (bad DB query in dev) and confirm the message is generic

---

## Prompt D — Overflow-scroll on Platform Admin Tables

**ADR Reference:** none
**Files:** `src/app/platform/page.tsx`, `src/app/platform/audit/page.tsx`, `src/app/platform/tenants/[id]/billing/page.tsx`
**Scope:** Three platform admin tables have no horizontal scroll wrapper. They break on screens < 640px. Wrap each table in `<div className="overflow-x-auto">`.

**Work:**
1. In `platform/page.tsx` at line ~111: wrap the `<table>` in `<div className="overflow-x-auto rounded-md border">`.
2. In `platform/audit/page.tsx`: same pattern around the audit log table.
3. In `platform/tenants/[id]/billing/page.tsx` at line ~121: same.

**Security:** UI-only change.

**Verification:**
- `npm run typecheck`
- `npm run lint`
- Resize browser to 375px and confirm tables scroll rather than overflow

---

## Prompt E — Loading Skeletons for High-Traffic Admin Routes

**ADR Reference:** none
**Files:** `src/app/admin/cohorts/loading.tsx`, `src/app/admin/sections/loading.tsx`, `src/app/admin/terms/loading.tsx`, `src/app/admin/blueprints/loading.tsx`, `src/app/admin/program-tracks/loading.tsx`, `src/app/courses/[id]/analytics/loading.tsx`, `src/app/courses/[id]/submissions/loading.tsx`
**Scope:** Create `loading.tsx` co-located with each page. A simple skeleton (3–5 rows of `animate-pulse` divs) is sufficient. Follow the pattern in `src/app/dashboard/loading.tsx` if it exists.

**Work:**
1. For each of the 7 routes, create a `loading.tsx` that matches the page's rough layout.
2. Use `<div className="animate-pulse bg-muted rounded h-8 w-full mb-2" />` repeated 5 times inside the page shell.
3. Do not add any data fetching — `loading.tsx` must be a pure skeleton.

**Security:** No auth changes.

**Verification:**
- `npm run typecheck`
- Add `await new Promise(r => setTimeout(r, 2000))` temporarily to a page and confirm skeleton appears

---

## Prompt F — Seed Data with Dual-Org Context

**ADR Reference:** none
**Files:** `supabase/seed.test.sql`
**Scope:** Rewrite the test seed to include two organizations (`ORG_A`, `ORG_B`), one user of each role per org, one published course per org with at least one content block, one enrollment, and one direct_enrollment. This enables the RLS isolation tests in `src/tests/e2e/rls-isolation.test.ts` to actually run.

**Work:**
1. Add `INSERT INTO public.organizations (id, name, slug, status)` for ORG_A (`00000000-0000-0000-0010-000000000001`) and ORG_B (`00000000-0000-0000-0010-000000000002`)
2. Add auth.users inserts for: `admin-a@test`, `teacher-a@test`, `student-a@test` (org A) and the same for org B using deterministic UUIDs matching `rls-isolation.test.ts` expected values
3. Add profile + profile_roles inserts with correct org_id for each user
4. Add one course per org with org_id set
5. Add one `direct_enrollment` per org linking student to course
6. Verify UUIDs match the `TEST_USER_*` env vars expected by the test file

**Security:** Seed is test-only. Must never contain real credentials. All UUIDs must be deterministic constants, not random.

**Verification:**
- `npm run test:e2e` (requires `.env.test.local` with Supabase test creds)
- Confirm `rls-isolation.test.ts` passes all 16 table checks

---

### Sprint 2 — Require Council Session First

The following gaps require a new council document (`COUNCIL-2026-NNN.md`) before implementation begins. They are not scoped here.

**G — Guardian email notification bridge**
New Edge Function triggered by DB events (course completion, badge award). New email template. New `profiles.settings.notifications.guardian` preference. Estimated: 2–3 days. Council document must define the trigger events, opt-out mechanism, and email template contract.

**H — Bulk user CSV import**
New admin route `/admin/users/import/`, new API route, server-side CSV parsing, validation, batch `auth.admin.createUser`, RLS-safe bulk profile_roles insert. Estimated: 2–3 days. Council document must define column schema, error reporting format, and rollback behavior.

**I — Org-level self-serve billing**
New page at `/admin/billing/` that shows current plan, invoice history, and Stripe Customer Portal link. Requires Stripe Customer Portal to be configured. Estimated: 1 day. Council document must clarify whether org admins can cancel (and the consequences for tenant status).

**J — PWA manifest + offline course player**
`manifest.json`, service worker via `next-pwa`, cache-first strategy for course content, offline fallback page. Estimated: 3–5 days. Council document must define which block types are offline-capable and cache invalidation strategy.

**K — Graded discussion block**
Wire `DiscussionPlayer` to `block_submissions` so posts count toward grade. New UI for teacher to set grade on discussion post. Estimated: 2 days. Council document must clarify grading schema (per-post vs. participation score).

---

## Execution Order

**Parallel (no dependencies between them):**
- Prompt A (nav aria-current)
- Prompt B (error boundaries)
- Prompt C (fix error.message)
- Prompt D (table overflow)
- Prompt E (loading skeletons)

**Sequential — Prompt F last:**
- Prompt F (seed data) depends on knowing the UUIDs in `rls-isolation.test.ts` — read that file first

**Sprint 2 — after Sprint 1 is merged:**
- G, H, I can run in parallel
- J and K each need a council session first

---

## Files Saved

- `docs/reviews/2026-06-20-council-review-1-synthesis.md` (this file)
- `docs/reviews/2026-06-20-council-review-1-agent-1-state.md`
- `docs/reviews/2026-06-20-council-review-1-agent-2-routes.md`
- `docs/reviews/2026-06-20-council-review-1-agent-3-ux.md`
- `docs/reviews/2026-06-20-council-review-1-agent-4-features.md`
- `docs/decisions/ADR-2026-001.md` — error boundary strategy
- `docs/decisions/ADR-2026-002.md` — navigation active state contract
