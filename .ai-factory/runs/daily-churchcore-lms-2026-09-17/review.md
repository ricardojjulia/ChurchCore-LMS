# Final local review

- Forward migrations only; historical migration files unchanged.
- Platform exception uses platform_admins via is_platform_admin(); ordinary staff remain active-tenant scoped. Real tests cover allowed SELECT and denied INSERT/UPDATE/DELETE.
- Group server action auth precedes tenant/section validation. Supabase query filters are parameterized; raw DB errors remain redacted.
- OneRoster provenance, staged apply, source locks, input bounds and signed-delivery tests remain passing. No raw PII or credentials added to logs/docs/source; no client service-key imports.
- React review: server pages stay server components, the editor remains a leaf client component, no extra data fetches/effects or dependencies; labels and date rendering verified in the browser.
- Current main's approved release workflow is retained. No new workflow modification beyond merging main; migration changes still require architect review under .github/CODEOWNERS.
- PR #5 is the existing review destination. No duplicate PR, no force push, no merge, no production approval, no Academy access.
