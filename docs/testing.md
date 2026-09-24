# Testing ChurchCore LMS

Every page, API method, Server Action and Edge Function ships with tests. CI
enforces it (COUNCIL-2026-031). This page covers how the tiers fit together,
how to run them, and what a new feature has to add.

## The tiers

| Tier | Where | Runs against | CI job |
|---|---|---|---|
| Unit | `src/**/*.test.ts(x)`, `src/tests/unit/` (Vitest) | mocks | `Unit Tests` |
| Database | `supabase/tests/*.sql` (pgTAP) | local Supabase | `E2E Tests` |
| DB-level e2e | `src/tests/e2e/`, `tests/e2e/` (Vitest) | local Supabase | `E2E Tests` |
| **Page sweep** | `tests/playwright/browser/pages.spec.ts` + `routes.ts` | production build + local Supabase | `Browser & API` |
| **API contracts** | `tests/playwright/api/*.spec.ts` | production build + local Supabase + Edge Functions | `Browser & API` |
| **Feature flows** | `tests/playwright/browser/flows/*.spec.ts` | production build + local Supabase | `Browser & API` |
| **Surface gate** | `scripts/test-surface.mjs` | nothing (static) | `Test Surface` |
| **Production synthetic** | `tests/playwright/prod/*.spec.ts` | **production**, synthetic tenant only | Release → `Production synthetic checks` |

## Run it locally

```bash
supabase start                      # once
npm run verify                      # typecheck + lint + unit + surface gate
npm run test:suite:local            # full browser + API suite (builds, seeds, serves, runs)
npm run test:suite:local -- --project=api                       # just the API contracts
SKIP_BUILD=1 npm run test:suite:local -- tests/playwright/browser/flows/learner.spec.ts
npm run test:surface -- --list      # every surface id
```

`test:suite:local` writes `.env.suite.local` (gitignored) from `supabase status`,
creates the seeded users, reseeds both test orgs (`seed.test.sql` + `seed.suite.sql`),
serves Edge Functions, builds, serves on :3100, runs Playwright and stops the server.
It **refuses to run against anything but a local Supabase**, and so does every spec
that touches the database. Never point `.env.test.local` at a hosted project.

Reports land in `playwright-report/` (open `index.html`), with traces for failures.

## Adding a feature: what the PR must include

1. **A new page:** add a row to `tests/playwright/browser/routes.ts` with who may see
   it (`allow`). The sweep then checks it renders for those roles (no error boundary,
   no console errors, a `<main>`, no serious/critical axe violations). It also checks
   that everyone else, anonymous visitors included, is kept out.
2. **A new API route or method:** add cases to the matching `tests/playwright/api/*.spec.ts`
   for anonymous → 401, wrong role → 403, bad input → 400, unknown/other-tenant id →
   404, and the happy path. Error bodies must not leak database text (`DB_LEAK`).
3. **A new Server Action:** exercise it through the UI in a flow spec and assert what
   was persisted (`fixtures/db.ts`). Where the UI can't reach it, write a unit test.
4. **A new Edge Function:** add it to `tests/playwright/api/edge-functions.spec.ts`.
   Scheduler-invoked functions must use `rejectUnlessCron`, and backend-only ones
   `rejectUnlessServiceRole` (`supabase/functions/_shared/cron-auth.ts`).
5. Tag every test with the surfaces it exercises: `covers('page:/x', 'action:file.fn')`.
   `npm run test:surface` fails on any untagged surface, and on tags that match nothing.

Council documents list these surface ids and their spec files in a **Test Surfaces**
section (see `docs/CODE-FACTORY-SYSTEM-PROMPT.md`).

### Exemptions and known issues (always dated)

- `tests/surface/exemptions.json` is for a surface that genuinely can't be tested yet.
  It needs `surface, reason, owner, expires`, and `expires` can be at most 60 days out.
  Expired, stale (now covered) and unknown entries fail the gate.
- `tests/surface/a11y-known.json` lists tolerated axe violations per page, with the
  same rules.
- **Known defects:** mark the failing assertion `test.fail()` with a comment naming
  the defect. When the defect is fixed the test starts passing, and Playwright then
  reports it as a failure until the marker is removed.

## Fixtures and roles

- Users (`fixtures/roles.ts`): admin, manager, teacher, student, guardian and platform
  (a student-role account in `platform_admins`) in Org A; admin-b and student-b in Org B.
  `auth.setup.ts` signs each in through the real `/login` form.
- Data: `supabase/seed.test.sql` (orgs, users, courses, academic structure) plus
  `supabase/seed.suite.sql` (UUID namespace `00c0`: blocks of every type, content
  page, cohort, track, bank, learning path, group, thread, certificate, and so on).
  IDs are mirrored in `fixtures/data.ts`.
- Flows name what they create with `runTag()` and clean up after themselves. The
  seed removes throwaway `suite-*@test.churchcore.dev` users.

## Production synthetic checks

After every approved release, `Production synthetic checks` signs in to production as
each role of the **ChurchCore Synthetic QA** tenant. It loads each role's core pages,
checks health, and does one write (an announcement draft) that it deletes again. It
never uses the service role, never calls AI or Stripe, and never touches another
tenant. Synthetic accounts use `@synthetic.churchcore.invalid`, which is undeliverable,
and the app refuses to email it anyway (`isDeliverableAddress`).

**One-time setup (owner):**

1. From your own shell, with the production service-role key (it's never stored)
   and a password you generate (the script never prints it):
   ```bash
   export SYNTHETIC_PASSWORD="$(openssl rand -base64 24)"
   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<key> \
     node scripts/prod-synthetic-bootstrap.mjs --yes
   echo "$SYNTHETIC_PASSWORD"   # copy into the GitHub secret below, then clear your terminal
   ```
2. In GitHub → Settings → Secrets and variables → Actions:
   - Secret `SYNTHETIC_PASSWORD`: the same password.
   - Variable `SYNTHETIC_BASE_URL`: the production app URL.
   - Variables `SYNTHETIC_SUPABASE_URL` and `SYNTHETIC_SUPABASE_ANON_KEY`: the public
     production Supabase URL and anon key, used to clean up the check's own draft.

Until the secret and base URL exist, the job skips with a notice.

## Unit and database e2e tests

### Running tests locally

```bash
npm run test              # unit tests in watch mode
npm run test:run          # unit tests, single pass
npm run test:ci           # unit tests + coverage report (mirrors CI)
npm run test:e2e          # e2e suite; fails if no e2e specs are discovered
```

### Unit test environment

Unit tests run entirely in-memory using mocked Supabase clients. No network calls, no Supabase project needed.

The global mock at `src/utils/supabase/__mocks__/client.ts` is injected automatically for all unit tests via `src/tests/setup.ts`.

### Writing unit tests

Co-locate tests next to source files:

```
src/lib/monitoring.ts
src/lib/monitoring.test.ts   ← same directory
```

Use the `describe / it / expect` pattern:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { myFunction } from './myFunction'

describe('myFunction', () => {
  it('returns the correct value when called with X', () => {
    expect(myFunction('X')).toBe('expected')
  })

  it('throws when input is invalid', () => {
    expect(() => myFunction(null)).toThrow()
  })
})
```

**Rules:**
- One assertion focus per test
- Mock all Supabase calls — `vi.mocked(createClient)` is available in all tests
- Use `vi.useFakeTimers()` for debounce/timeout tests — always clean up with `vi.useRealTimers()`
- Test failure cases, not just happy paths
- Never sleep in tests — mock time instead

### Coverage thresholds

| Path | Minimum line coverage |
|---|---|
| `src/lib/**` | 64% |
| `src/hooks/**` | 34% |
| `src/utils/**` | 80% |
| `src/app/actions/groups.ts` | 80% |
| `cohorts.ts` / `messages.ts` / `learning.ts` actions | 40% / 35% / 18% |

Run `npm run test:ci` to see current coverage. The thresholds are enforced in CI and will fail the job if not met.

### E2E test environment setup

#### Prerequisites

1. Start the local Supabase stack:
   ```bash
   supabase start
   supabase db reset --local
   ```
2. Export the values from `supabase status --output env` into `.env.test.local` (never commit this file):
   ```
   TEST_SUPABASE_URL=http://127.0.0.1:54321
   TEST_SUPABASE_ANON_KEY=...
   TEST_SUPABASE_SERVICE_ROLE_KEY=...
   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   APP_BASE_URL=http://localhost:3000
   TEST_USER_PASSWORD=<strong-random-test-only-password>
   ```
3. Create or update the disposable Auth users:
   ```bash
   SUPABASE_URL="$TEST_SUPABASE_URL" \
   SUPABASE_SERVICE_ROLE_KEY="$TEST_SUPABASE_SERVICE_ROLE_KEY" \
   node scripts/ci-setup-test-env.mjs
   ```
4. Seed test data:
   ```bash
   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seed.test.sql
   ```
5. Serve the Edge Functions in a separate terminal:
   ```bash
   supabase functions serve
   ```
6. Start the dev server in another terminal:
   ```bash
   npm run dev
   ```
7. Run e2e tests:
   ```bash
   npm run test:e2e
   ```

#### Test users

| Email | Role | UID prefix |
|---|---|---|
| `admin@test.churchcore.dev` | admin | `0002-000000000001` |
| `teacher@test.churchcore.dev` | teacher | `0002-000000000002` |
| `student@test.churchcore.dev` | student | `0002-000000000003` |
| `admin-b@test.churchcore.dev` | admin | `0002-000000000004` |
| `student-b@test.churchcore.dev` | student | `0002-000000000005` |
| `guardian@test.churchcore.dev` | guardian | `0002-000000000006` |

All test user passwords are set by `scripts/ci-setup-test-env.mjs` — never hardcode them in test files.

### E2E test patterns

E2E specs live in `tests/e2e/` and `src/tests/e2e/`. They require `// @vitest-environment node` at the top and use real Supabase client calls against the test project.

```typescript
// @vitest-environment node
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.TEST_SUPABASE_URL ?? '',
  process.env.TEST_SUPABASE_ANON_KEY ?? '',
)
```

Never hardcode credentials in spec files — always use `process.env.*`.

### CI integration

- **`ci.yml`** — runs lint → typecheck → unit tests with coverage → build
- **`e2e.yml`** — runs on PR to main only; starts and seeds an isolated local Supabase stack in the runner

Neither unit nor E2E tests require access to an external Supabase project in CI.


### Database regression suite

Run `supabase test db` against a disposable local Supabase stack after all migrations.
CI runs all 16 SQL suites before creating E2E users. The current suite contains
340 assertions; each file declares an exact plan and rolls back its fixtures.
`supabase/tests/helpers/fixtures.inc` is an include, not a standalone test file.
Its Auth IDs intentionally differ from domain profile UIDs to expose identity mistakes.

The checks include real allowed and denied operations for two organizations,
active/suspended tenants, anonymous users, member/nonmember students and staff,
plus OneRoster apply/provenance/linking/signed delivery. Do not replace failing
assertions with empty queries or unconditional passes. An exit code alone is
insufficient: check the TAP plan and every assertion.

Never reset a shared or hosted database for verification. If the local service
stack cannot start, record the failure. Transactional SQL checks on an isolated
schema snapshot are useful evidence but do not replace a fresh full-stack CI run.

E2E suites mutate their seed state, including enrollment removal. Re-run the
local seed before each full suite invocation. Use separate synthetic accounts
for simultaneous browser checks: test sign-out can invalidate another session
for the same user. Production-build smoke should use `npm run build` followed
by `npm run start`, as well as the development server used by hosted E2E.


#### Group capacity races

After migrations, run `node scripts/group-capacity-concurrency-test.mjs` with
`TEST_DATABASE_URL` pointing to a disposable loopback database. CI runs this
before seeding API E2E accounts. Two authenticated writers compete for the last
place: READ COMMITTED rejects the loser with `PCC01`; REPEATABLE READ rejects
its stale transaction with `40001`. Both cases persist exactly one member.
The script creates and removes only its uniquely identified synthetic fixtures.
A same-value parent update creates a row version as well as taking a lock; a
lock alone does not invalidate a stale REPEATABLE READ snapshot.

Group capacity applies to new assignments and moves. Staff cannot reduce a
maximum below the current count. Existing over-capacity data is preserved;
removals and role edits remain possible, and unlimited groups remain unlimited.
