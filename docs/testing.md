# Testing Guide — ChurchCore LMS

## Running tests locally

```bash
npm run test              # unit tests in watch mode
npm run test:run          # unit tests, single pass
npm run test:ci           # unit tests + coverage report (mirrors CI)
npm run test:e2e          # e2e suite; fails if no e2e specs are discovered
```

## Unit test environment

Unit tests run entirely in-memory using mocked Supabase clients. No network calls, no Supabase project needed.

The global mock at `src/utils/supabase/__mocks__/client.ts` is injected automatically for all unit tests via `src/tests/setup.ts`.

## Writing unit tests

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

## Coverage thresholds

| Path | Minimum line coverage |
|---|---|
| `src/lib/**` | 64% |
| `src/hooks/**` | 34% |
| `src/utils/**` | 80% |
| `src/app/actions/groups.ts` | 80% |
| `cohorts.ts` / `messages.ts` / `learning.ts` actions | 40% / 35% / 18% |

Run `npm run test:ci` to see current coverage. The thresholds are enforced in CI and will fail the job if not met.

## E2E test environment setup

### Prerequisites

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

### Test users

| Email | Role | UID prefix |
|---|---|---|
| `admin@test.churchcore.dev` | admin | `0002-000000000001` |
| `teacher@test.churchcore.dev` | teacher | `0002-000000000002` |
| `student@test.churchcore.dev` | student | `0002-000000000003` |
| `admin-b@test.churchcore.dev` | admin | `0002-000000000004` |
| `student-b@test.churchcore.dev` | student | `0002-000000000005` |
| `guardian@test.churchcore.dev` | guardian | `0002-000000000006` |

All test user passwords are set by `scripts/ci-setup-test-env.mjs` — never hardcode them in test files.

## E2E test patterns

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

## CI integration

- **`ci.yml`** — runs lint → typecheck → unit tests with coverage → build
- **`e2e.yml`** — runs on PR to main only; starts and seeds an isolated local Supabase stack in the runner

Neither unit nor E2E tests require access to an external Supabase project in CI.


## Database regression suite

Run `supabase test db` against a disposable local Supabase stack after all migrations.
CI runs all 15 SQL suites before creating E2E users. The current suite contains
327 assertions; each file declares an exact plan and rolls back its fixtures.
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
