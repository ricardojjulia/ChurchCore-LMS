# Testing Guide — ChurchCore LMS

## Running tests locally

```bash
npm run test              # unit tests in watch mode
npm run test:run          # unit tests, single pass
npm run test:ci           # unit tests + coverage report (mirrors CI)
npm run test:e2e          # e2e suite (requires test env — see below)
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
| `src/lib/**` | 80% |
| `src/hooks/**` | 70% |
| `src/utils/**` | 90% |

Run `npm run test:ci` to see current coverage. The thresholds are enforced in CI and will fail the job if not met.

## E2E test environment setup

### Prerequisites

1. Provision a separate Supabase project for testing (never use production)
2. Add the following to `.env.test.local` (never commit this file):
   ```
   TEST_SUPABASE_URL=https://your-test-project.supabase.co
   TEST_SUPABASE_ANON_KEY=...
   TEST_SUPABASE_SERVICE_ROLE_KEY=...
   TEST_DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
   APP_BASE_URL=http://localhost:3000
   TEST_USER_PASSWORD=TestPassword!2025
   ```
3. Apply migrations:
   ```bash
   supabase db push --db-url "$TEST_DATABASE_URL"
   ```
4. Seed test data:
   ```bash
   psql "$TEST_DATABASE_URL" -f supabase/seed.test.sql
   ```
5. Set test user passwords:
   ```bash
   node scripts/ci-setup-test-env.mjs
   ```
6. Start the dev server:
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
| `student2@test.churchcore.dev` | student | `0002-000000000004` |

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
- **`e2e.yml`** — runs on PR to main only; requires test Supabase project secrets to be set

Unit tests are safe to run in CI without any external services. E2E tests require the test project secrets listed in `docs/github-setup.md`.
