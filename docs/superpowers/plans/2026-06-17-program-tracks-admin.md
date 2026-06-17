# Program Tracks Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class admin UI for creating and maintaining program tracks used by course blueprints and cohorts.

**Architecture:** Follow the existing admin CRUD pattern used by Blueprints, Terms, and Cohorts. Program track mutations live in `src/app/actions/academic.ts`; pages live under `src/app/admin/program-tracks`; navigation is added to the existing admin sidebar.

**Tech Stack:** Next.js App Router, React Server Components, server actions, Supabase, Vitest.

---

### Task 1: Server Actions

**Files:**
- Modify: `src/app/actions/academic.ts`
- Create: `src/app/actions/academic.test.ts`

- [ ] Write failing tests for `createProgramTrack` and `updateProgramTrack`.
- [ ] Run `npx vitest run src/app/actions/academic.test.ts` and verify missing exports fail.
- [ ] Implement `createProgramTrack(formData)` with required name/code, uppercase code, optional description, duplicate handling, revalidation, and redirect.
- [ ] Implement `updateProgramTrack(trackId, formData)` with required name, optional description, active checkbox, and revalidation.
- [ ] Run `npx vitest run src/app/actions/academic.test.ts` and verify passing.

### Task 2: Admin Pages

**Files:**
- Create: `src/app/admin/program-tracks/page.tsx`
- Create: `src/app/admin/program-tracks/new/page.tsx`
- Create: `src/app/admin/program-tracks/new/ProgramTrackForm.tsx`
- Create: `src/app/admin/program-tracks/[id]/page.tsx`

- [ ] Add list page with admin/manager guard, active/inactive badges, and create link.
- [ ] Add shared create/edit form matching existing admin form styling.
- [ ] Add new page loading no initial data.
- [ ] Add edit page loading the selected track and passing initial data to the shared form.

### Task 3: Navigation And Verification

**Files:**
- Modify: `src/components/layout/SidebarClient.tsx`

- [ ] Add Program Tracks to the Admin sidebar near Blueprints.
- [ ] Run `npx vitest run src/app/actions/academic.test.ts`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build` if typecheck passes.
