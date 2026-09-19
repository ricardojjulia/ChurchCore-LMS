# Implementation Brief - M3 Scheduled Exchange

Council authority: `docs/council/COUNCIL-2026-019.md`

## Numbered Execution

1. Repair reusable CI without changing existing push or pull-request checks.
2. Add replay-safe, tenant-scoped signed-delivery schema and RLS.
3. Extract transport-independent package validation and staging.
4. Implement and unit-test the Ed25519 signature profile.
5. Add the signed Academy delivery endpoint with no automatic apply.
6. Add authenticated connection, transport history, and received-job preview APIs.
7. Add the admin connection and review UI.
8. Verify fresh migrations, RLS, routes, unit tests, E2E, build, and browser state.
9. Ship LMS through its own PR. Prepare Academy sender only in a separately
   authorized Academy worktree and PR.

## Binding Boundaries

- Standalone mode remains the default and performs no exchange work.
- LMS stores only Academy public verification material.
- No raw ZIP, signature, roster PII, provider credential, or raw error is stored.
- Receipt validates and stages only. Authenticated operator review and apply
  remain mandatory.
- Identity linking remains explicit; Auth user creation remains out of scope.
