# Progress — September 18

- Primary checkout preserved at 738f193; existing PR #5 source 0692106 verified in detached worktree.
- Main be17a76 adds CHECK_IN_POLICY.md only. PR #5 remains open without architect approval. Release 35148363218 waits for production approval but is now stale; release 35275376004 is queued for current main.
- Baseline PASS: 239 unit, 327 SQL, 77 local production E2E, lint/type/build/version/audit. No cloud or secondary-repository writes.
- Reproduced authenticated over-capacity membership insert. Council 022 ratified before implementation.
- Added invoker capacity triggers with parent row-version serialization, safe action error, 13 SQL assertions, and two-isolation concurrency proof.
- Full SQL initially exposed an arbitrary LIMIT 1 fixture selecting another tenant's group. Bound the check to its own group; all 340 assertions now pass.
- Actionlint exposed inherited needs: []; removed the invalid empty dependency list. New concurrency test runs in E2E CI.
- Final local verification PASS: 240 unit, 340 SQL after fresh replay, 77 E2E after fresh reseed, lint/type/build/version/audit/actionlint, local DB lint and concurrency. Authenticated UI and backing data passed; staff received the safe capacity error.
- Publishing to existing LMS PR #5; hosted checks and merge gate pending.
