# Actual verification — September 18

| Check | Result |
|---|---|
| `npm run test:ci` | PASS: 30 files, 240 tests with existing coverage thresholds |
| `npm run typecheck`, `npm run lint`, `npm run version:check`, `npm run build` | PASS: version 0.26.5 and Next.js 16.3.5 |
| `npm audit` | PASS: zero vulnerabilities |
| Fresh isolated Supabase migration replay | PASS through `20260918101500_enforce_group_capacity.sql` |
| `supabase test db` | PASS: 16 files, 340 assertions after fixture correction, repeated after fresh reset |
| `supabase db lint --local --schema public,private` | PASS: no schema errors |
| Capacity concurrency | PASS: competing READ COMMITTED and REPEATABLE READ writers persist exactly one member; loser receives PCC01 or serialization retry 40001 |
| OneRoster concurrency | PASS: contended apply denied; post-release apply created one course |
| `npm run test:e2e` | PASS: 8 files, 77 tests against production build, repeated after fresh reset and reseed |
| `actionlint` | PASS after removing inherited empty `needs` list |
| Security scans | PASS: zero ordinary public tables without RLS; zero direct service client imports in browser entries; no service key in 82 static client JS files |
| Authenticated browser | PASS: admin and learner dashboards, courses, sections, terms, health, reports, certificates, OneRoster, group threads/replies, 390 px mobile group view without horizontal overflow; safe capacity error confirmed |
| Data persistence | PASS: OneRoster invalid/valid/replay/deactivation counts and group reply Auth/domain ID distinction matched Postgres |

Initial SQL run failed one pre-existing membership-role assertion because `LIMIT 1` selected a newly present unrelated tenant group. It now selects its deterministic fixture; the original `23514` invalid-role assertion remains. `actionlint` exposed the inherited `needs: []` syntax error, now fixed. Both checks pass.

No paid AI, Stripe payment, outbound email, live Realtime subscriptions or production UI was exercised. The disposable stack excluded Realtime, Studio and analytics. Initial empty report charts emitted nonfatal size warnings. See external execution report for hosted CI and release state.
