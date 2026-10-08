# COUNCIL-2026-046: Academic Structure Quality Hardening, Design System Alignment, and Capacity Enforcement

**Status:** RATIFIED — fully verified
**Date:** 2026-10-02
**Council:** Architecture Council, ChurchCore LMS (6/6 approve, 2026-10-02; owner directed review and hardening of Blueprints, Program Tracks, Terms, and Sections)
**Related:** COUNCIL-2026-035 (academic structure Phase 1A), COUNCIL-2026-036 (Phase 1B), `supabase/migrations/20261002220000_academic_bridge_hardening.sql`, `src/components/courses/CourseForm.tsx`, `src/app/admin/terms`, `src/app/admin/program-tracks`, `src/app/admin/sections`, `src/app/admin/blueprints`
**Tags:** academic-structure, blueprints, program-tracks, terms, sections, capacity, design-system, i18n

---

## Context

An architectural and quality evaluation of the 5-layer academic system (Program Tracks $\to$ Course Blueprints $\to$ Academic Terms $\to$ Course Sections $\to$ LMS Delivery Courses via the Academic Bridge) identified the following items requiring resolution:

1. **Course Creation Workflow Disruption:** In `CourseForm`, quick action buttons (*Create Program Track*, *Create Blueprint*, *Create Term*, *Create Section*) operated within the same window, causing users to lose unsaved course drafts when navigating to create missing prerequisite academic entities.
2. **Design System Divergence:** Multiple admin pages (`admin/terms`, `admin/program-tracks`, `admin/sections`, `admin/blueprints`) utilized legacy `text-amber-300` edit links or breadcrumb styling instead of the unified `text-indigo-400 hover:text-indigo-300` / `hover:text-white` tokens mandated in `CHURCHCORE_DESIGN_SYSTEM.md`.
3. **Academic Bridge Non-Deterministic Course Resolution:** In `bridge_section_to_course_enrollment()`, when a blueprint had multiple revisions or drafts, the resolution query lacked deterministic sorting, risking binding section enrollments to unpublished or stale revisions.
4. **Section Capacity Invariant:** Course sections specify `max_enrollment`, but database-level constraint enforcement was missing on direct enrollment inserts and updates.
5. **Localization (i18n):** `adminTerms` and `adminProgramTracks` lacked comprehensive localization entries in English, Spanish, and Portuguese.

---

## Decision

1. **Safe Academic Workflow Navigation (`CourseForm.tsx`):**
   - Quick create buttons for Program Tracks, Blueprints, Terms, and Sections open safely in `target="_blank"` with `rel="noopener noreferrer"`.
   - Accessible decorative link arrows marked with `aria-hidden="true"`.
   - Modernized visual styling adhering to `bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl`.

2. **Full Design System Token Alignment:**
   - Standardized all edit links to `text-indigo-400 hover:text-indigo-300 hover:underline`.
   - Standardized all breadcrumb links to `text-slate-400 hover:text-white transition-colors`.
   - Amber tokens strictly reserved for warning badges and draft statuses.

3. **Academic Bridge Resolution Hardening (`supabase/migrations/20261002220000_academic_bridge_hardening.sql`):**
   - Hardened `bridge_section_to_course_enrollment()` to deterministically select the published active delivery course:
     ```sql
     ORDER BY (c.status = 'published') DESC, c.updated_at DESC LIMIT 1
     ```

4. **Database-Enforced Section Capacity:**
   - Created `enforce_section_capacity()` trigger function on `direct_enrollments` raising error `PCC01` if an active enrollment exceeds `course_sections.max_enrollment`.
   - Created `enforce_section_capacity_reduction()` trigger function on `course_sections` preventing reducing `max_enrollment` below current active student count.

5. **Complete i18n Localization:**
   - Added `adminTerms` and `adminProgramTracks` translation namespaces across `messages/en.json`, `messages/es.json`, and `messages/pt.json`.
   - Wired server components to `getTranslations()` for zero hard-coded string drift.

---

## Council Vote

| Voice | Vote | Rationale |
|---|---|---|
| **Product Owner** | APPROVE | Preserving instructor course creation drafts when adding academic prerequisites is a critical UX win. |
| **Engineer** | APPROVE | Clean implementation, all 85 test suites pass, zero TypeScript errors. |
| **Architect** | APPROVE | The 5-layer academic bridge now has deterministic resolution and database-enforced capacity invariants. |
| **Security Lead** | APPROVE | `SECURITY DEFINER` trigger functions properly restricted with `REVOKE ALL FROM anon, public` and `search_path = public`. |
| **QA Lead** | APPROVE | 700 tests pass, 298/298 surface coverage maintained with zero regressions. |
| **Data Engineer** | APPROVE | Migration is backwards-compatible and introduces no table locks or unindexed joins. |

**6/6 unanimous approval.**

---

## Amendments Adopted

1. **Accessibility Compliance:** External link icons (`↗`) marked `aria-hidden="true"` so assistive technologies read the explicit action name.
2. **Deterministic Sort Invariant:** Bridge course binding always prioritizes published status before last modified timestamp.
3. **Capacity Guardrails:** Capacity reduction prevented if existing active enrollments exceed proposed cap.

---

## Definition of Done & Verification

- `npm run verify` executed and clean:
  - `npm run typecheck`: 0 errors.
  - `npm run lint`: 0 warnings/errors.
  - `npm run test:run`: 85/85 test files passing (700 tests).
  - `npm run test:surface`: 298/298 surfaces covered (100%).
- All academic views verified for design system consistency and multilingual support.
