# Council Review 3 — Synthesis

**Date:** 2026-09-19 · **Branch:** codex/oneroster-verification-refresh · **Version:** 0.28.1
**Scope note:** this was a full-app audit, not a diff-scoped review of the recent feedback-system/i18n branch work — findings here span the whole codebase, not just this session's changes.

Agent reports: [Agent 1 — State](2026-09-19-council-review-3-agent-1-state.md) · [Agent 2 — Routes](2026-09-19-council-review-3-agent-2-routes.md) · [Agent 3 — UX](2026-09-19-council-review-3-agent-3-ux.md) · [Agent 4 — Feature/Competitive](2026-09-19-council-review-3-agent-4-features.md)

---

## Claims verified false before entering this synthesis

Per this repo's own council quality rule ("verify factual claims... agents can be wrong or stale"), two of Agent 1's five original "critical gaps" did not hold up:

1. **"profile_roles tenant_active never refreshed on org status change"** — **False.** `sync_org_status_to_profiles(p_org_id)` (defined in `supabase/migrations/20260618200100_tenant_lifecycle.sql`) is actually called from `src/app/platform/actions.ts` at lines 100, 112, and 126 — the suspend, restore, and reactivate actions all invoke it via `service.rpc(...)`. No gap.
2. **"Platform admin bootstrap hardcoded, no self-service"** — **Not a gap.** This is `CLAUDE.md` rule 6's deliberate design: *"First platform admin is bootstrapped via a migration (hardcoded auth UUID), never via application UI."* Agent 4 independently confirmed this is "correct per ADR." Flagging it as a gap contradicts standing governance.

Also: Agent 4's SCORM/xAPI gap (Competitive Gap 3) restates an already-ratified decision — `ADR-2026-006` explicitly defers SCORM pending a customer contract trigger. Not new scope.

---

## Cross-Agent Consensus

### Consensus Finding: Guardian portal/notification reliability is the weakest link
**Flagged by:** Agent 1 (state — no retry/dead-letter on `guardian_notification_queue`), Agent 3 (UX — `/guardian` missing both `loading.tsx` and `error.tsx`), Agent 4 (feature — guardian Resend delivery "requires runtime verification," no teacher↔guardian messaging, cited as a closed-beta blocker)
**Priority:** CRITICAL

Three agents, auditing from completely different angles (data layer, UI shell, product completeness), independently converged on the same root cause without seeing each other's work. That's the strongest possible signal in a council review. See `ADR-2026-010` for the accepted fix shape.

No other finding was independently flagged by 2+ agents — the rest of this synthesis lists high-confidence single-agent findings, kept separate from the consensus item per the council's own "no wishlist" rule (these are concrete, cited bugs/gaps, not invented scope).

---

## Implementation Prompts — bug/reliability fixes (not new features)

These are corrections to existing, already-shipped behavior. Per your instruction, I'm treating these as safe to proceed on without a separate check-in — say if you'd rather review first.

### Prompt A — Fix the `/auth/login` broken redirect (CRITICAL, confirmed)
**Files:** 35 files under `src/app/` calling `redirect('/auth/login')` (confirmed via `grep -rl` during synthesis — full list obtainable via the same grep)
**Scope:** Every one of these calls 404s today — there is no `/auth/login` route; the real login page is at `/login`. `middleware.ts` already redirects correctly to `/login`; these are separate, incorrect calls in page-level auth guards.
**Work:**
1. Global find-replace `redirect('/auth/login')` → `redirect('/login')` (and the double-quoted variant if any) across all 35 files.
2. Grep afterward to confirm zero remaining occurrences of `/auth/login`.
**Security:** No security implication — this is a dead-link fix, not an access-control change. The underlying auth check (`if (!user) redirect(...)`) is unaffected.
**Verification:** `npm run typecheck`, `npm run lint`, `npm test`, manual: hit one affected page unauthenticated, confirm redirect lands on `/login` not a 404.

### Prompt B — Guardian notification retry/dead-letter + missing loading/error states (ADR-2026-010)
**Files:** new migration for `guardian_notification_queue` columns + retry logic, `src/app/guardian/loading.tsx` (NEW), `src/app/guardian/error.tsx` (NEW, follow the `(reports)/error.tsx` pattern), wherever the digest/delivery job currently marks a row `failed`
**Scope:** Implement ADR-2026-010 in full: `attempt_count`/`next_retry_at` columns, bounded retry with backoff, `dead_letter` terminal state visible to admins, and the two missing Next.js boundary files.
**Work:** See ADR-2026-010's Decision section for the four concrete steps.
**Security:** No new RLS surface — existing `guardian_notification_queue` policies extend to the new columns automatically. `dead_letter` visibility must go through the same admin-only read path already used for the rest of that table — do not create a new unauthenticated query path.
**Verification:** `npm run typecheck`, `npm run lint`, `npm test`, `supabase db push`, manual: force a delivery failure in a local/dev environment and confirm it retries then dead-letters rather than silently disappearing.

### Prompt C — Missing `loading.tsx`/`error.tsx` for `/platform` and `/hq`
**Files:** `src/app/platform/loading.tsx` (NEW), `src/app/hq/error.tsx` (NEW)
**Scope:** `/platform` has no loading skeleton (blank screen for admins on slow connections); `/hq` has no error boundary. Follow the existing `loading.tsx`/`error.tsx` patterns already used elsewhere in the app (e.g. `/admin`, `/courses`).
**Work:** Add a skeleton loading state matching `/platform`'s table layout; add a standard error boundary to `/hq` matching the root `error.tsx` pattern but scoped to that segment.
**Security:** None — presentation-layer only.
**Verification:** `npm run typecheck`, `npm run lint`, manual: throttle network and confirm a skeleton renders for `/platform`; manually throw in `/hq` during dev to confirm the boundary catches it.

### Prompt D — Add `@media print` stylesheet
**Files:** `src/app/globals.css`
**Scope:** Certificates and reports pages have export/download affordances but no print stylesheet — browser print (Cmd+P) currently renders broken layouts (nav, dark backgrounds, buttons all print as-is).
**Work:** Add a `@media print` block: hide nav/buttons/interactive chrome via a `.no-print` utility class applied where needed, force `background: white; color: black`, add sensible page-break rules for certificate/report content.
**Security:** None.
**Verification:** `npm run typecheck`, `npm run lint`, manual: print-preview a certificate and a report page, confirm no dark backgrounds or nav chrome bleed onto paper.

### Prompt E — Stripe `stripe_customer_id` backfill race
**Files:** wherever `/api/stripe/create-checkout` or its webhook handler creates the Stripe customer
**Scope:** `organizations.stripe_customer_id` is nullable with no sync guarantee before checkout completes — if a tenant opens the billing portal before the webhook lands, portal access is blocked.
**Work:** Ensure the Stripe customer is created (and `stripe_customer_id` persisted) synchronously at checkout-session-creation time, not only via the webhook — the webhook should update, not be the sole writer.
**Security:** No RLS change. Confirm `stripe_customer_id` writes still only happen server-side via the existing service-role path.
**Verification:** `npm run typecheck`, `npm run lint`, `npm test`, manual: start checkout, check `stripe_customer_id` is populated before the webhook fires.

### Prompt F — `/admin/question-banks/new` dead link
**Files:** `src/app/admin/question-banks/page.tsx:65`
**Scope:** Judgment call, not prescribed here — either build the missing `new` page or remove the link, depending on whether question-bank creation already has another entry point. **Flagging rather than prescribing** since building the page could shade into "a feature," per your instruction to check in on those.

---

## Explicitly flagged, not proceeding without your say — these are features

Per your instruction, stopping here rather than building:

- **Automated enrollment on registration** (Agent 4, competitive gap #4, called "the most broken end-user flow for church adoption" and the top-ranked fix). New product behavior: what happens on join (auto-enroll in a default course? none? admin-configured?) is a real product decision, not a bug fix.
- **Holistic gradebook grid** (competitive gap #1) — new UI surface, non-trivial.
- **Public course catalog / unauthenticated preview pages** (competitive gap #2) — new, unauthenticated-facing surface with real security-review implications (what can an anonymous visitor see).
- **Teacher↔guardian direct messaging** (competitive gap #5) — extends an existing system into a new cross-role permission surface.
- **OneRoster partial-failure rollback** (Agent 1 gap #3) — confirmed real, but this touches a workstream with its own active, separate automated pipeline (`.ai-factory/runs/`, `docs/factory-status.md`) — recommend routing this to whoever owns that thread rather than picking it up here, to avoid two uncoordinated efforts touching the same migrations.

---

## Execution Order

```
Prompt A (auth/login fix)  ─┐
Prompt C (loading/error)    ├─ independent, safe to run in parallel
Prompt D (print CSS)        ┘
Prompt E (Stripe backfill)  — independent, run any time
Prompt F (question-banks/new) — decide scope first (page vs. remove link)
Prompt B (guardian ADR-2026-010) — largest of the set (new migration + job logic); run after A/C/D since it also touches /guardian's loading/error files
```

A, C, D, E have no dependencies on each other and can be parallelized. F needs a scope decision before work starts. B is the biggest single prompt and should be sequenced after the others land to avoid touching `/guardian/loading.tsx`/`error.tsx` twice.

---

## Status: all six prompts implemented (2026-09-19), plus OneRoster investigated

Per explicit instruction, all six bug/reliability prompts (A–F) were implemented, and the OneRoster partial-failure gap was investigated rather than left for a separate owner:

- **A** — done, 35 files + one JSX `href` fixed globally.
- **B** — done: migration `20260919130000_guardian_notification_retry_deadletter.sql`, `supabase/functions/send-guardian-notifications/index.ts` rewritten to track real per-row failure instead of always marking `sent_at`, `src/app/guardian/loading.tsx` + `error.tsx` added.
- **C** — done: `src/app/platform/loading.tsx`, `src/app/hq/error.tsx` added.
- **D** — done: `@media print` block in `globals.css`, `.no-print` applied to shell nav (Sidebar/MobileBottomNav/MobileAdminDrawer/Toaster/FeedbackButton), `ReportsNav`, admin/student report filter and export rows, and the certificate-completion page's action buttons.
- **E** — done, and turned out worse than originally described: `stripe_customer_id` was never written by any code path (not merely racy) — every org's billing portal permanently returned "No active subscription." Fixed in `create-checkout/route.ts` (synchronous write, reuses existing customer on retry) and `webhook/route.ts` (idempotent fallback).
- **F** — resolved by building the page (`src/app/admin/question-banks/new/`) — the server action (`upsertQuestionBank`) already existed, only the page/form were missing, so this was a small CRUD completion rather than new product scope.
- **OneRoster rollback (Agent 1 Gap 3) — investigated, not a real bug.** Agent 1 cited `20260907110000_oneroster_transactional_apply.sql`, but the actual enrollment-writing function is `apply_oneroster_job()` in `20260908130000_oneroster_identity_linking.sql`. Both OneRoster apply functions already wrap each row in its own `BEGIN...EXCEPTION WHEN OTHERS` block — Postgres's implicit per-row subtransaction — so a failed row's `direct_enrollments` write and its `external_entity_links` write roll back together atomically, and only that row is quarantined. No fix applied; implementing one would have risked regressing already-correct transactional code.

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run version:check` all pass. The SQL migration was applied and manually verified against a local Postgres instance. The Deno Edge Function change could not be typechecked in this environment (no local `deno` binary) — reviewed carefully by hand instead.
