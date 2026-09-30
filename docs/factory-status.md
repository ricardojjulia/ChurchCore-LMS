# LMS status: where to look

Updated 2026-09-26. This file used to hold a hand-maintained status table (last accurate at v0.26.6). That table is retired: it drifted out of date.

| Question | Source of truth |
|---|---|
| What is in production? | `CHANGELOG.md` (currently **0.36.1**, deployed 2026-09-26 by release 36205642654) |
| How ready is the product, and how does it compare? | `docs/reviews/2026-09-26-mvp-competitive-status.md` |
| What is planned next, in what order? | `docs/implementation-plan-2026-q4.md` |
| Why was a decision made? | `docs/council/` (features) and `docs/decisions/` (ADRs) |
| How is it tested? | `docs/testing.md`; every release runs unit, pgTAP, browser/API/mobile and surface-coverage gates |

Historical daily-run evidence stays in `.ai-factory/runs/`.
