## Summary

<!-- One paragraph: what changed and why. Be specific. -->

## Type of change

- [ ] New feature
- [ ] Bug fix
- [ ] Database migration
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] Security fix

## Security checklist

- [ ] No secrets committed (no `.env`, no hardcoded keys)
- [ ] No RLS bypass (`SET row_security = off`, service role on client, etc.)
- [ ] New tables have RLS enabled and at least one policy
- [ ] SECURITY DEFINER functions validate caller role before data access
- [ ] AI calls go through `/api/ai`, not direct Anthropic calls from client
- [ ] `createClient()` from server utils is properly `await`ed

## Database changes

- [ ] No database changes
- [ ] Migration added: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
- [ ] Migration is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`)
- [ ] Migration tested locally with `npx supabase db push`

## Testing

<!--
Describe what you tested manually. List the roles you tested as.
Example:
- Tested as student: enrolled in course, completed last block, verified certificate appeared
- Tested as teacher: enrolled/unenrolled student, verified notification was sent
- Tested as admin: verified all students visible in enrollment page
-->

- Tested as:
  - [ ] student
  - [ ] teacher
  - [ ] admin

## Changelog

<!-- Add the user-visible change under [Unreleased] in CHANGELOG.md. Paste it here. -->

```
### Added / Changed / Fixed / Removed / Security
- ...
```

## Screenshots (if UI changed)

<!-- Before / After screenshots if this changes any UI. Delete this section if not applicable. -->

## Breaking changes

<!-- Does this change any API, schema, or behavior that existing users/code depends on? -->

- [ ] No breaking changes
- [ ] Breaking change — describe impact and migration path below:

## Frontend & Routing Checklist

_If this PR includes new components or modifies existing ones:_

- [ ] A page file exists that renders this component at a navigable route
- [ ] That route is linked from appropriate navigation
- [ ] An API route exists for every fetch/mutation the component performs
- [ ] Auth guards exist on both the page and the API route
- [ ] Loading, success, and error states are implemented

## Definition of Done (ADR-2025-004 checklist)

_Only required for PRs that touch a gap from ADR-2025-004. Delete this section otherwise._

- [ ] All five gaps addressed (GAP-001 through GAP-005) or scope is explicitly deferred with a follow-up ticket
- [ ] `current_user_uid()` / `current_user_role()` used in all new RLS policies — no direct `public.profiles` references
- [ ] `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` not referenced in any client bundle or committed file
- [ ] `system_health_checks` table has no client write path (Edge Function / service role only)
- [ ] `attempt_number` backfill migration (044) applied before deploy
- [ ] Blueprint RLS policies reviewed and tested as teacher + admin roles
- [ ] Guardian RPC audit result documented (pass/fail + evidence)
- [ ] `SYSTEM_ACTOR_ID` constant used for all automated audit entries (no inline UUID literals)
- [ ] `system-health-check` Edge Function deployed and `/api/health` route wired if admin UI is included
