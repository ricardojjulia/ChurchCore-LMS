# Security and diff review

- Verified auth and staff checks before group mutation. The trigger is SECURITY INVOKER and uses existing RLS to find the destination group; tenant mismatch is denied.
- Group row-version update forces a stale REPEATABLE READ writer to retry; READ COMMITTED is capped by a count after serialized lock acquisition.
- No service-role use or credentials in client components, build output or changed source. Direct tests cover cross-tenant denial, existing platform read-only identity, active tenant boundaries and OneRoster provenance.
- Dependency audit is clear. Migration is forward-only and idempotent; existing members are preserved. SQL test and concurrency proof run against a disposable local database.
- User's main checkout, untracked factory folder and `.sync.ffs_db` were preserved. Academy and cloud databases were not modified.
- PR #5 still needs current-head hosted CI and architect review before merge under `.github/CODEOWNERS`. Production approval is a separate gate.
