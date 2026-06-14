# Security Rules

## Non-Negotiables
- RLS enabled on every table. No exceptions.
- `ANTHROPIC_API_KEY` lives in `.env.local` / Vercel env vars only. Never in client bundles.
- `NEXT_PUBLIC_*` variables are public — treat them as such. Never put secrets there.
- No service-role key usage in frontend code or client-accessible edge routes.
- Storage buckets: private by default. Explicit policies required for any read access.

## Threat Model — Top Risks

| Risk | Mitigation |
|------|-----------|
| Student reads another student's submission | RLS `student_id = auth.uid()` policy on `submissions` |
| Client forges XP award | XP only updated server-side via trigger or admin edge function |
| Client forges badge award | `profile_badges` INSERT policy requires `role = 'admin'` |
| IDOR on course content | Module SELECT policy requires enrollment check |
| Level/prerequisite bypass | Enforced in RLS `courses` SELECT policy, not UI |
| Anthropic key leak | All AI calls proxied through `/api/ai` server route |
| Mass assignment via Supabase REST | Only expose needed columns; use column-level grants if sensitive |

## Auth Flow
- Supabase Auth issues signed JWTs.
- JWTs are verified by Postgres natively via `auth.uid()` and `auth.role()`.
- Middleware validates session on every `/dashboard` and `/courses` request.
- Auth callback at `/callback` exchanges OAuth/magic-link codes for sessions.

## Review Gate
Before any PR merges:
- [ ] New tables have RLS enabled
- [ ] New policies have been tested for each role
- [ ] No secrets committed (run `git grep -i "sk-ant\|supabase.*key"` before push)
- [ ] Anthropic API not called from client-side code
- [ ] Upload endpoints enforce file type and size limits
