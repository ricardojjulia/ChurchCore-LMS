# ChurchCore LMS — Sprint 2–4 Implementation Plan
## Version 0.23.0 → 0.26.0 · June 2026

---

## Wildcard Pre-Review of the Priority List

*The Wildcard speaks first — unconventional observations before the council locks in scope.*

**1. "Engagement Tracker" is the wrong name for the most important feature you're building.**

You're building a Discipleship Ledger. Every church that adopts this system will be asked by
their leadership board: "Can you prove that our discipleship programs are working?" XP and streaks
answer that question — but only if the framing is "spiritual formation accountability," not
"gamification loop." Rename the engagement dashboard language: "Engagement Summary" not
"Activity Feed," "Formation Streak" not "Daily Streak," "Ministry XP" not "Points." The code
is identical; the language changes everything about adoption.

**2. Focus Mode (rank #8) should be rank #2.**

It's a 2-hour implementation with near-zero risk. Teachers who see it immediately understand
the product is thoughtfully designed. Every other feature is enhanced by focus mode existing.
Ship it in the same sprint as the Engagement Tracker.

**3. Leaderboards (rank #10) will generate pushback in church environments.**

"We don't want competition in our ministry programs" is a real objection from pastors and
church administrators. Before shipping leaderboards, add an org-level toggle: `organizations.leaderboard_enabled BOOLEAN DEFAULT TRUE`. If false, the leaderboard is hidden for that org.
This is a 15-minute addition to COUNCIL-2026-015 that prevents a customer success problem.

**4. The AI Outline Generator (rank #9) is ranked too low.**

This feature has the highest onboarding impact of anything on the list. A church that uploads
their existing curriculum and gets a working course outline in 8 seconds will immediately "get"
ChurchCore LMS in a way that no demo can produce. It should be Sprint 2, not Sprint 3.
Consider swapping it with Question Banks (rank #6) — Question Banks are table stakes;
AI Outline Generator is a wow moment.

**5. SCORM and Revenue Sharing are correctly deferred (see ADR-2026-006, ADR-2026-007).**

No further council action needed until specific customer or business trigger.

---

## Council Response to Wildcard

| Wildcard Observation | Council Decision |
|---|---|
| "Discipleship Ledger" naming | ACCEPTED — admin UI uses formation/discipleship language; code uses engagement_ prefix |
| Focus Mode to rank #2 | ACCEPTED — Focus Mode moves to Sprint 2A alongside Engagement Tracker |
| Leaderboard opt-out toggle | ACCEPTED — add `organizations.leaderboard_enabled` column to COUNCIL-2026-015 migration |
| AI Outline Generator to Sprint 2 | PARTIAL — AI Outline Generator moves to Sprint 2B; Question Banks stays Sprint 3 |
| SCORM/Revenue Sharing deferred | CONFIRMED — ADR-2026-006 and ADR-2026-007 on record |

---

## Governance Documents Produced

### Architecture Decision Records
| ADR | Title | Status |
|---|---|---|
| [ADR-2026-004](decisions/ADR-2026-004.md) | Engagement Events as Immutable Ledger | ACCEPTED |
| [ADR-2026-005](decisions/ADR-2026-005.md) | @dnd-kit/core for Drag-and-Drop Builder | ACCEPTED |
| [ADR-2026-006](decisions/ADR-2026-006.md) | SCORM Runtime Deferred to Sprint 4+ | ACCEPTED |
| [ADR-2026-007](decisions/ADR-2026-007.md) | Revenue Sharing Deferred as Separate Product | ACCEPTED |

### Council Ratification Documents
| COUNCIL | Title | Effort | Version |
|---|---|---|---|
| [COUNCIL-2026-006](council/COUNCIL-2026-006.md) | Engagement Tracker + Ledger | High | 0.23.0 |
| [COUNCIL-2026-007](council/COUNCIL-2026-007.md) | Teacher Plug Module | Low | 0.23.1 |
| [COUNCIL-2026-008](council/COUNCIL-2026-008.md) | PDF Certificate Download | Low | 0.23.2 |
| [COUNCIL-2026-009](council/COUNCIL-2026-009.md) | Drag-and-Drop Course Builder | Medium | 0.24.0 |
| [COUNCIL-2026-010](council/COUNCIL-2026-010.md) | Quiz Extended Types (Matching, Fill-blank, Timer) | Medium | 0.24.1 |
| [COUNCIL-2026-011](council/COUNCIL-2026-011.md) | Question Banks | Medium | 0.24.2 |
| [COUNCIL-2026-012](council/COUNCIL-2026-012.md) | Badge Auto-Triggers | Low | 0.24.3 |
| [COUNCIL-2026-013](council/COUNCIL-2026-013.md) | Focus Mode | Low | 0.23.3 |
| [COUNCIL-2026-014](council/COUNCIL-2026-014.md) | AI Outline Generator | High | 0.25.0 |
| [COUNCIL-2026-015](council/COUNCIL-2026-015.md) | Leaderboards | Medium | 0.25.1 |

---

## Sprint Plan

### Sprint 2A — Foundation + Quick Wins
*Target: v0.23.0 → v0.23.3 · ~2 weeks*
*Theme: The engagement foundation ships with the two zero-risk UX wins.*

| # | Feature | Council Doc | Target Version | Effort | Dependency |
|---|---|---|---|---|---|
| 1 | Engagement Tracker + Ledger | COUNCIL-2026-006 | 0.23.0 | High | None — first feature |
| 2 | Teacher Plug Module | COUNCIL-2026-007 | 0.23.1 | Low | None |
| 3 | PDF Certificate Download | COUNCIL-2026-008 | 0.23.2 | Low | None |
| 4 | Focus Mode | COUNCIL-2026-013 | 0.23.3 | Low | None |

**Sprint 2A Commit Order:**
```
feat: v0.23.0 — Engagement Tracker + Ledger (COUNCIL-2026-006)
feat: v0.23.1 — Teacher Plug Module (COUNCIL-2026-007)
feat: v0.23.2 — PDF Certificate Download (COUNCIL-2026-008)
feat: v0.23.3 — Focus Mode (COUNCIL-2026-013)
```

**Sprint 2A Notes:**
- Items 2, 3, 4 are independent of each other and of item 1 — they can be implemented in parallel if multiple engineers are available.
- Item 1 (Engagement Tracker) has the only migration with significant complexity. Implement first, test thoroughly.
- The `record_engagement_event()` function from item 1 is a dependency for item 8 (Badge Auto-Triggers) in Sprint 2B. Finish item 1 before starting item 8.

---

### Sprint 2B — AI + Rewards
*Target: v0.24.0 → v0.24.3 · ~2 weeks*
*Theme: Automated rewards + AI-powered onboarding.*

| # | Feature | Council Doc | Target Version | Effort | Dependency |
|---|---|---|---|---|---|
| 5 | Drag-and-Drop Builder | COUNCIL-2026-009 | 0.24.0 | Medium | None (ADR-2026-005) |
| 6 | Badge Auto-Triggers | COUNCIL-2026-012 | 0.24.1 | Low | COUNCIL-2026-006 (engagement_streaks) |
| 7 | AI Outline Generator | COUNCIL-2026-014 | 0.24.2 | High | None |
| 8 | Quiz Extended Types | COUNCIL-2026-010 | 0.24.3 | Medium | None |

**Sprint 2B Commit Order:**
```
feat: v0.24.0 — Drag-and-Drop Course Builder (COUNCIL-2026-009)
feat: v0.24.1 — Badge Auto-Triggers (COUNCIL-2026-012)
feat: v0.24.2 — AI Outline Generator (COUNCIL-2026-014)
feat: v0.24.3 — Quiz: Matching + Fill-blank + Timer (COUNCIL-2026-010)
```

**Sprint 2B Notes:**
- Item 6 (Badge Auto-Triggers) MUST come after v0.23.0 (Engagement Tracker) is deployed — it depends on `engagement_streaks` table and `record_engagement_event()`.
- Items 5, 7, 8 are independent of each other and can be parallelized.
- The AI Outline Generator requires `ANTHROPIC_API_KEY` env var (verify it's set in Vercel and Supabase Edge Function env).
- `@dnd-kit/core` + `@dnd-kit/sortable` must be npm installed before item 5 implementation starts.

---

### Sprint 3 — Assessment Depth + Community
*Target: v0.25.0 → v0.25.1 · ~1.5 weeks*
*Theme: Assessment infrastructure + community leaderboard.*

| # | Feature | Council Doc | Target Version | Effort | Dependency |
|---|---|---|---|---|---|
| 9 | Question Banks | COUNCIL-2026-011 | 0.25.0 | Medium | COUNCIL-2026-010 (quiz types) |
| 10 | Leaderboards | COUNCIL-2026-015 | 0.25.1 | Medium | COUNCIL-2026-006 (xp system) |

**Sprint 3 Commit Order:**
```
feat: v0.25.0 — Question Banks (COUNCIL-2026-011)
feat: v0.25.1 — Leaderboards (COUNCIL-2026-015)
```

**Sprint 3 Notes:**
- Item 9 (Question Banks) should come after Quiz Extended Types (v0.24.3) — bank questions support all four question types including the new ones from Sprint 2B.
- Item 10 (Leaderboards): the `organizations.leaderboard_enabled` column added in the COUNCIL-2026-015 migration also addresses the Wildcard's opt-out recommendation.
- These two features are independent of each other and can be parallelized.

---

### Sprint 4 — TBD
*Scope: SCORM runtime (ADR-2026-006 gate: must have customer contract trigger before ratification) or new council session based on post-Sprint-3 gap analysis.*

---

## Dependency Graph

```
v0.22.1 (current baseline)
    │
    ├── COUNCIL-2026-006 (Engagement Tracker) ──── v0.23.0
    │       │
    │       └── COUNCIL-2026-012 (Badge Triggers) ─ v0.24.1
    │               │
    │               └── COUNCIL-2026-015 (Leaderboards) ─ v0.25.1
    │
    ├── COUNCIL-2026-007 (Teacher Plug) ──────────── v0.23.1  (independent)
    ├── COUNCIL-2026-008 (PDF Certificate) ─────────  v0.23.2  (independent)
    ├── COUNCIL-2026-013 (Focus Mode) ───────────────  v0.23.3  (independent)
    │
    ├── COUNCIL-2026-009 (DnD Builder) ────────────── v0.24.0  (independent)
    ├── COUNCIL-2026-014 (AI Outline) ───────────────  v0.24.2  (independent)
    │
    ├── COUNCIL-2026-010 (Quiz Extended) ───────────── v0.24.3  (independent)
    │       │
    │       └── COUNCIL-2026-011 (Question Banks) ─── v0.25.0
```

**Strict ordering required:**
- `v0.23.0` before `v0.24.1` (Badge Triggers needs engagement_streaks)
- `v0.24.3` before `v0.25.0` (Question Banks should support all quiz types)
- `v0.23.0` before `v0.25.1` (Leaderboards reads profiles.xp_points kept in sync by award_xp)

**Can be parallelized (no dependency between them):**
- COUNCIL-2026-007, 008, 013 can all be implemented simultaneously after v0.23.0
- COUNCIL-2026-009, 014, 010 can all be implemented simultaneously
- COUNCIL-2026-011 and 015 can be implemented simultaneously

---

## Software Factory Execution Instructions

### How to Execute a COUNCIL Document

Each COUNCIL document contains a **self-contained Implementation Prompt** in the "Implementation Prompt" section. To have the Software Factory implement a feature:

1. Open a new Claude Code session (fresh context)
2. Set the working directory to `/Users/rjulia/ChurchCore LMS`
3. Copy the Implementation Prompt from the relevant COUNCIL document
4. Paste into the session as your first message

The factory will:
- Read the specified files before writing code
- Follow the Phases in order
- Run `npm run typecheck` at the end of each phase
- Bump the version and CHANGELOG at the end
- Produce a commit-ready codebase

### Pre-Flight Checklist (Before Each Sprint)

**Before Sprint 2A:**
- [ ] `git status` clean on `main`
- [ ] `npm run typecheck` passes on current codebase
- [ ] Supabase connection confirmed (`supabase status`)
- [ ] ANTHROPIC_API_KEY set in `.env.local` (for Sprint 2B AI features)
- [ ] Upstash Redis env vars set (for Sprint 2B rate limiting)

**Before each COUNCIL execution:**
- [ ] Previous COUNCIL's version is committed and pushed
- [ ] `npm run typecheck` exits 0
- [ ] `npm run version:check` exits 0
- [ ] All dependencies listed in the COUNCIL doc are deployed

### Post-Feature Checklist (After Each Implementation)

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0 (max-warnings 0)
- [ ] `npm run test:ci` exits 0
- [ ] `npm run version:check` exits 0
- [ ] CHANGELOG.md has new version entry
- [ ] `supabase db push` applied (for features with migrations)
- [ ] Manual test of the golden path completed
- [ ] Committed with format: `feat: vX.Y.Z — [Feature Name] (COUNCIL-2026-NNN)`

---

## Version Roadmap Summary

| Version | Feature | Council |
|---|---|---|
| 0.22.1 | Security hardening baseline (current) | ADR-2026-003 |
| **0.23.0** | **Engagement Tracker + Ledger** | COUNCIL-2026-006 |
| 0.23.1 | Teacher Plug Module | COUNCIL-2026-007 |
| 0.23.2 | PDF Certificate Download | COUNCIL-2026-008 |
| 0.23.3 | Focus Mode | COUNCIL-2026-013 |
| **0.24.0** | **Drag-and-Drop Course Builder** | COUNCIL-2026-009 |
| 0.24.1 | Badge Auto-Triggers | COUNCIL-2026-012 |
| 0.24.2 | AI Outline Generator | COUNCIL-2026-014 |
| 0.24.3 | Quiz Extended Types | COUNCIL-2026-010 |
| **0.25.0** | **Question Banks** | COUNCIL-2026-011 |
| 0.25.1 | Leaderboards | COUNCIL-2026-015 |
| 0.26.x | Sprint 4 (TBD — pending SCORM gate or new council session) | — |

---

## Open Items Requiring Non-Engineering Action

| Item | Owner | Notes |
|---|---|---|
| Stripe Customer Portal configuration | Manual — Stripe Dashboard | Deferred from Sprint 1 |
| Revenue Sharing business model | Product / Legal | ADR-2026-007 on record; no code until decided |
| SCORM contract trigger | Sales / Customer Success | ADR-2026-006 on record; defer until contract signed |
| `organizations.leaderboard_enabled` default | Product | Default TRUE; orgs can opt out via admin settings |
| AI Outline Generator rate limit (5/hr) | Ops | Adjust via Upstash dashboard if needed post-launch |

---

*Document produced by Architecture Council, ChurchCore LMS — 2026-06-21*
*Next council review: after Sprint 3 ships (target: 2026-08-01)*
