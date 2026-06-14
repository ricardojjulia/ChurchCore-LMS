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
