# Plan

1. Verify original repository identity, local changes, environments and prior release.
2. Create an isolated worktree from current origin/main; preserve the original checkout.
3. Reproduce legacy SQL failures and dependency advisories; ratify bounded repairs in COUNCIL-2026-020.
4. Repair real tenant/identity defects, tests and the group UI; use forward migrations.
5. Run unit, SQL, concurrency, schema lint, type/lint/version/build and browser checks.
6. Publish an LMS PR, verify hosted checks, and preserve the architect-review merge gate.
7. Record remaining Academy scope without claiming the approved plan complete.
