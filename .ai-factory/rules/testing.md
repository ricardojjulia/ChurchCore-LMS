# Testing Rules

## Test Categories and Gates

### RLS Policy Tests (P0 — blocks release)
Every table must have tests for each role × operation combination:
- Student: can only read/write their own rows
- Teacher: can read/write within their course scope
- Admin: full access
- Unauthenticated: no access to any protected table

Use Supabase's `supabase test db` or a dedicated test Supabase project with seeded roles.

### Integration Tests (P0 — blocks release)
- Enrollment flow: student enrolls → can see course modules → can submit → XP awarded
- Level gating: student below required level cannot see gated course
- Prerequisite gating: student without passing grade cannot access dependent course
- Badge award: only server-side admin operations succeed; client-side attempt is rejected by RLS

### E2E Tests (P1)
- Happy path: sign up → login → enroll → view module → submit assignment
- Teacher flow: login → create course → publish → view student submissions → grade
- Auth guard: unauthenticated user redirected to `/login` from `/dashboard` and `/courses/*`

### Unit Tests (P2)
- `handle_xp_level_escalation` trigger: verify level formula at boundary XP values
- `ModuleItemRenderer`: renders correct icon and XP badge per node type

## Definition of Done for any feature
- [ ] RLS policy tests written and passing
- [ ] Happy path E2E passes
- [ ] Edge cases documented and tested
- [ ] No TypeScript errors (`tsc --noEmit`)
- [ ] `npm run build` succeeds
