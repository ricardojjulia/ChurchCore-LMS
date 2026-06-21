# ChurchCore LMS — Claude Code Instructions

Read this file entirely before taking any action. Everything here is mandatory.

---

## Project Identity

ChurchCore LMS is a multi-tenant learning management system for churches and ministries.
Repo: `/Users/rjulia/ChurchCore LMS`
This is a **separate** project from `/Users/rjulia/ChurchCore` and `/Users/rjulia/ChurchCore Academy`. Do not confuse them.

---

## Stack

- **Framework**: Next.js 15 App Router, TypeScript (strict), Tailwind CSS
- **Backend**: Supabase — Postgres, Row Level Security, Auth, Storage, Edge Functions (Deno)
- **Deploy**: Vercel (frontend + serverless), Supabase cloud
- **Email**: Resend via `src/lib/email.ts`, React Email components in `src/emails/`
- **AI**: Anthropic Claude (HQ + weekly summary via `/api/ai` edge passthrough), OpenAI (tutor + embeddings)
- **Payments**: Stripe (webhook + checkout in `src/app/api/stripe/`)
- **Rate limiting**: Upstash Redis via `src/lib/rate-limit.ts`
- **Storage**: Private `content-images` bucket, signed URLs via `src/lib/storage.ts`
- **Testing**: Vitest, `globals: true`, real Supabase for e2e tests

---

## Commands

```
npm run dev           — start dev server
npm run build         — production build
npm run typecheck     — tsc --noEmit (must pass before any commit)
npm run lint          — next lint --max-warnings 0
npm test              — vitest unit tests
npm run test:e2e      — vitest e2e (real Supabase, requires env vars)
npm run test:ci       — vitest run with coverage
npm run version:check — assert package.json version matches CHANGELOG
```

---

## Auth Pattern

```typescript
// Server component / Route Handler:
import { createClient } from '@/utils/supabase/server'
const supabase = await createClient()
const { data: { user } } = await supabase.auth.getUser()

// Client component:
import { createClient } from '@/utils/supabase/client'

// Server-side service operations (bypasses RLS):
import { createServiceClient } from '@/utils/supabase/service'
// NEVER import createServiceClient in client components or expose to browser.
```

---

## Security Rules — Non-Negotiable

1. **RLS is the security source of truth.** Never `SET row_security = off`. Never use `SECURITY DEFINER` to bypass tenant isolation.
2. **`current_user_org_id()`** reads from `profile_roles` (hot-path table). Never reference `profiles` in RLS policies on other tables — that causes infinite recursion.
3. **Service role key** (`SUPABASE_SERVICE_ROLE_KEY`) is server-side only. Never in client components, never in the browser.
4. **All RLS policies** must use `current_user_uid()` and `current_user_role()` helper functions, not `auth.uid()` directly.
5. **`is_platform_admin()`** reads ONLY `platform_admins` table — never `profiles.role`.
6. **First platform admin** is bootstrapped via a migration (hardcoded auth UUID), never via application UI.
7. **Error boundaries** never expose stack traces in production DOM.
8. **No PII** (email, auth_id, uid) in OpenAI prompts.
9. **Every new table** requires a migration file AND `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.
10. **Storage objects** must enforce org_id in the path: `{org_id}/{auth_uid}/{timestamp}.ext`.

---

## RLS Pattern (mandatory)

```sql
-- Every policy must follow this shape:
CREATE POLICY "table: action description"
  ON public.table_name FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR public.current_user_org_id() = org_id
  );
```

---

## Supabase Helper Functions

| Function | Returns | Purpose |
|---|---|---|
| `current_user_uid()` | UUID | Domain UID from profile_roles |
| `current_user_org_id()` | UUID | Org from profile_roles (hot path) |
| `current_user_role()` | text | Role from profile_roles |
| `is_platform_admin()` | bool | Reads platform_admins only |

---

## Data Model — Key Tables

- `organizations` — tenants; `status` field gates all RLS via `tenant_active` in profile_roles
- `profiles` — users; PK is `uid` (UUID), FK `auth_id` → auth.users
- `profile_roles` — RLS hot-path: `auth_id, uid, role, org_id, tenant_active`
- `courses` — `status` enum (not `is_published`), `org_id` FK
- `platform_audit_log` — Stripe webhook idempotency + platform admin actions
- `hq_sessions / hq_tasks / hq_risks / hq_decisions` — HQ governance tables

Migration naming: `YYYYMMDDHHMMSS_description.sql`. Always `supabase db push` to apply.

---

## File Conventions

```
src/
  app/          — Next.js routes (App Router)
    api/        — Route Handlers (thin, call into src/lib/ or actions)
    actions/    — Server Actions ('use server')
    platform/   — Platform admin console
    (auth)/     — Auth routes (grouped, no layout prefix)
  lib/          — Shared server utilities
  emails/       — React Email components (props only, no data fetching)
  tests/
    e2e/        — Integration tests against real Supabase
  types/        — Shared TypeScript types
supabase/
  migrations/   — SQL migrations (source of truth)
  functions/    — Deno Edge Functions
docs/
  council/      — Council review documents (COUNCIL-YYYY-NNN.md)
  decisions/    — ADRs (ADR-YYYY-NNN.md)
```

---

## API Route Shape

```typescript
// Route Handlers stay thin — auth, validate, delegate, respond
export const runtime = 'nodejs' // or 'edge' if no Node.js APIs needed

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // validate body → call lib function → return response
}
```

---

## Testing Standards

- Unit tests: Vitest, co-located or in `src/tests/`
- E2E tests: real Supabase, deterministic seed UUIDs, env vars only (no hardcoded credentials)
- Every feature needs: happy path + validation failure + not-found (minimum)
- Coverage thresholds enforced in `vitest.config.ts` — do not lower them

---

## Governance

Every significant change requires a council document in `docs/council/` before implementation.
Council format: `COUNCIL-YYYY-NNN.md` — see existing examples.
ADR format: `ADR-YYYY-NNN.md` — see `docs/decisions/`.
The council document contains the implementation prompt. Implement from the prompt, not from memory.

See `docs/CODE-FACTORY-SYSTEM-PROMPT.md` for the full council governance rules.

---

## Don't Do

- Do not call `profiles` in RLS policies on other tables (infinite recursion)
- Do not put the service role key in client components
- Do not use `getPublicUrl()` for `content-images` — bucket is private, use `createSignedUrl()`
- Do not modify the data model without a migration file
- Do not add new dependencies without mentioning it (may affect bundle size or edge runtime)
- Do not add `console.log` with sensitive data (user IDs, tokens, emails)
- Do not use `// @ts-ignore` or `any` without a comment explaining why
- Do not commit `.env.local` — add to `.env.local.example` instead
- Do not log raw Stripe payloads
- Do not return DB errors directly to the client

---

## Docs to Read Before Guessing

- `docs/CODE-FACTORY-SYSTEM-PROMPT.md` — full council governance protocol
- `docs/council/` — past council decisions and ratified implementation prompts
- `docs/decisions/` — ADRs
- `supabase/migrations/` — source of truth for the data model
- `src/tests/e2e/` — how integration tests are structured
