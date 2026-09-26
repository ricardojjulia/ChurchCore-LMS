# ChurchCore LMS — MVP and Competitive Status

**Date:** 2026-09-26 · **Version in production:** 0.36.1 (release 36205642654) · **Previous assessment:** Council Review 3, 2026-09-19, v0.28.1 (MVP score 83/100)

## Summary

The product is **feature-complete for a closed beta and not yet ready for a public launch.**

The three competitive gaps Council Review 3 ranked highest have shipped: auto-enrollment on registration, a public course catalog, and a gradebook grid. So have learning paths and public certificate verification.

The larger change since the last review is **how much of the product is proven to work.** A full browser and API test suite (COUNCIL-2026-031) showed that several core features had been silently broken in production:

- Messaging, assignment/quiz/video/discussion submissions, course progress and attendance
- Guardian emails and the weekly digest
- PDF certificates and reports
- Certificate verification

All of that is fixed, deployed and covered by an automated browser and API suite (768 test cases, as reported by the Playwright runner) that now gates every release. The previous 83/100 score assumed those features worked; they did not.

The remaining gap is **commercial, not technical.** Production has two organizations, 2 users active in the last 30 days, no Stripe customers, and no feedback in the triage queue. No tenant can sign itself up. App-sent email is not configured in production yet.

| Measure | Score | Change |
|---|---|---|
| Product completeness (core LMS loop, verified) | **88 / 100** | Up from an overstated 83; now backed by tests |
| Closed-beta readiness | **Ready, after 3 configuration items** | See "Before a closed beta" |
| Public-launch readiness | **55 / 100** | Blocked on self-serve signup, a live billing path and adoption evidence |

---

## 1. Where the product stands today

### What exists

| Area | Capability | Verified by |
|---|---|---|
| Tenancy and security | Multi-tenant orgs with Postgres row-level security and org isolation; platform admin console; tenant lifecycle (trial, suspend, restore, soft-delete); audit log | pgTAP suites, API contract tests, page sweep across 8 roles |
| Course building | 10 buildable block types: page, video, quiz (including question banks and random draw), assignment, discussion, file, link, live session, attendance, teacher intro. XP per block, drafts and publishing, AI course-outline generator | Authoring flow tests |
| Learning | Learning shell with progress, quizzes, submissions, discussions, video must-view, AI tutor grounded in course content, certificates on completion, XP, levels, badges, streaks, leaderboard | Learner flow tests (17 steps) |
| Assessment | Submission review, per-course gradebook grid with CSV export, question banks, minimum passing grades and attempt limits | Gradebook e2e and flow tests |
| Structure | Academic terms, blueprints, sections, cohorts, program tracks, learning paths (discipleship tracks) | Admin flow tests |
| Communication | Announcements (course, org-wide, role), direct and group messaging, notifications, calendar with personal events | Messaging and announcement flows |
| Guardians | Guardian portal (ward progress, grades, certificates), guardian email notifications with retry and dead-letter handling, unsubscribe | Guardian API tests; production job now running |
| Reporting | Admin, instructor and student reports; PDF and XLSX export; AI analytics | Report flow tests (PDFs verified since 0.36.0) |
| Growth surfaces | Branded `/join/[slug]` registration with Turnstile, auto-enrollment, public course catalog and preview, public certificate verification | API and page tests |
| Integrations | OneRoster (school SIS) with staging, preview, apply and identity linking; Stripe checkout, portal and webhooks | API contract tests |
| Platform | English and Spanish UI, PWA manifest and offline page, pilot-feedback triage workspace, HQ governance workspace with AI agents | Page sweep |

**Size:** 85 pages, 34 API routes, 97 server actions and 10 Edge Functions. All but one are covered by a tagged test (225/226; one surface is exempt with an expiry date).

### Quality and security posture

This is now a real differentiator: few products in this category, church-focused ones especially, are held to it.

- **Every release is gated** by unit tests (488, Vitest runner count), database tests (pgTAP), 768 browser/API/mobile test cases (Playwright runner count, which expands each page across 8 roles), CodeQL, and a rule that every page, API route, action and function ships with a test.
- **Zero tolerated accessibility violations** (WCAG 2 AA, serious and critical) on every page, for every role.
- **Security issues closed since 2026-09-19** (plus five dependency advisories in 0.29.1):
  - Self-service privilege escalation to admin
  - An unauthenticated AI proxy
  - Anonymous XP awarding
  - Anonymous access to privileged database functions
  - A shared demo password
  - Fail-open scheduled-job authentication
  - An open redirect
  - Database error leaks

  None is known to have been exploited.
- **Releases** deploy exactly the approved commit, with a production approval gate and post-release synthetic checks (ready to switch on).

### Production reality (read-only snapshot, 2026-09-26)

| Metric | Value |
|---|---|
| Organizations | 2: **Biblos** (trial, 6 users, 3 courses) and **ChurchCore Demo Seminary** (active, 28 users, 21 courses) |
| Users / active in the last 30 days | 34 / **2** |
| Published courses | 23 |
| Enrollments / submissions / certificates | 138 / 276 / 10 |
| Message threads | 0 (messaging did not work before 0.35.0) |
| Learning paths | 0 |
| Orgs with a Stripe customer | **0** |
| Pilot feedback items | **0** |

The product is running, but it hasn't been used by a real congregation at any scale yet. Most of its data is demo content.

---

## 2. Changes since Council Review 3 (v0.28.1 → v0.36.1)

| Release | What changed |
|---|---|
| 0.29 | Guardian notification retry and dead-letter handling; `stripe_customer_id` was never written (billing portal broken for everyone), now fixed; broken `/auth/login` redirects in 35 files |
| 0.29.1 | Security: pinned the transitive `fast-uri` dependency, closing 5 high-severity advisories (host confusion / SSRF via URI normalization) |
| 0.30 | **Auto-enrollment on registration** (the review's #1 adoption blocker); `enrollSelf` had always failed on a database constraint |
| 0.31 | **Public course catalog and preview**; fixed recursive org access checks that broke every anonymous org query |
| 0.32 | **Public certificate verification** (broken by a query bug until 0.36.0) |
| 0.33 | **Gradebook grid**; closed a gap where any teacher could grade another teacher's course |
| 0.34 | **Learning paths / discipleship tracks** |
| 0.34.1–0.34.3 | Closed the open `/api/ai` proxy and profile privilege escalation |
| 0.35.0 | Full test suite and release test gate; fixed messaging, submissions, progress, attendance, guardian email, storage buckets and more |
| 0.36.0 | React 19 (PDFs work), server-side XP, database-function lockdown, weekly digest end to end, accessibility clean |
| 0.36.1 | `pg_net` enabled: guardian notification emails had never been sent (27,756 failed runs since June); release deploys via Vercel-side build |

---

## 3. Competitive position

ChurchCore competes in three overlapping markets. Competitor capabilities below describe **what each category typically offers**; individual products were not re-checked for this report.

| Market | Typical products | What buyers expect |
|---|---|---|
| General LMS | Canvas, Moodle, Schoology, TalentLMS | Gradebook, rubrics, SSO, SCORM, integrations, mobile apps |
| Course platforms | Thinkific, Teachable, Kajabi | Public storefront, paid courses, landing pages, easy self-serve signup, video hosting |
| Church and ministry | Ministry training platforms, church content libraries, church apps | Ready-made content, church management (ChMS) integration, simple volunteer admin, low price |

### Capability comparison

| Capability | ChurchCore | General LMS | Course platforms | Church-focused |
|---|---|---|---|---|
| Multi-tenant org admin, roles, cohorts, terms | ✅ | ✅ | ⚠️ limited | ⚠️ varies |
| Gradebook grid and question banks | ✅ | ✅ | ⚠️ basic | ❌ usually |
| Rubric grading | ❌ | ✅ | ❌ | ❌ |
| Guardian / parent portal | ✅ | ✅ (K-12 tools) | ❌ | ❌ usually |
| Discipleship tracks (learning paths) | ✅ | ✅ | ✅ (bundles) | ⚠️ varies |
| AI tutor grounded in course content | ✅ | ⚠️ emerging | ⚠️ emerging | ❌ usually |
| AI course-outline generation | ✅ | ⚠️ emerging | ⚠️ emerging | ❌ usually |
| Spanish UI | ✅ | ✅ | ✅ | ⚠️ varies |
| Gamification (XP, badges, streaks, leaderboard) | ✅ | ⚠️ plugins | ⚠️ | ❌ usually |
| Public catalog and preview | ✅ | ⚠️ | ✅ | ✅ |
| Certificates with public verification | ✅ | ✅ | ✅ | ⚠️ |
| OneRoster (school SIS) | ✅ | ✅ | ❌ | ❌ |
| Attendance and in-person sessions | ✅ | ⚠️ | ❌ | ⚠️ |
| Self-serve org signup and trial | ❌ | ✅ (SaaS tiers) | ✅ | ✅ |
| Paid courses / storefront | ❌ | ⚠️ | ✅ | ⚠️ |
| SSO / social login | ❌ | ✅ | ✅ | ⚠️ |
| SCORM / xAPI | ❌ (deferred, ADR-2026-006) | ✅ | ⚠️ | ❌ |
| Native mobile app / push notifications | ❌ (PWA only) | ✅ | ✅ | ✅ |
| Hosted video (upload, streaming) | ❌ (YouTube/Vimeo embeds) | ⚠️ | ✅ | ✅ |
| Ready-made content library | ❌ | ❌ | ❌ | ✅ (core offer) |
| ChMS integration (e.g. Planning Center) | ❌ | ❌ | ❌ | ✅ often |
| Teacher ↔ guardian messaging | ❌ | ✅ (K-12) | ❌ | ❌ |

### Where ChurchCore wins

1. **Christian schools, Bible institutes and seminaries.** Terms, sections, cohorts, gradebook, attendance, guardians, OneRoster and certificates together are rare outside general LMSs, and general LMSs aren't built for churches.
2. **Discipleship at church scale.** Discipleship tracks, auto-enrollment on joining, gamification and an AI tutor fit a congregation's "next steps" pathway better than a course storefront does.
3. **Bilingual congregations.** English and Spanish are built in.
4. **Trust.** Tenant isolation enforced in the database, an accessibility-clean UI and release-gated tests are credible talking points for school boards and denominations.

### Where it loses today

1. **No self-serve start.** A church can't sign up and start a trial; every tenant is created by a platform admin. Every course platform and most church tools have this.
2. **No content.** Church buyers often choose a platform for its library. ChurchCore has AI outline generation but no ready-to-run courses.
3. **No ChMS link.** Churches keep people in a church management system; without a sync, admins retype people.
4. **Mobile experience.** A PWA without push notifications competes against native church apps.
5. **Enterprise checkboxes.** SSO, rubrics and SCORM matter for schools and denominations.

---

## 4. Readiness assessment

### Before a closed beta (a small number of real congregations)

| # | Item | Status | Owner |
|---|---|---|---|
| 1 | Set `RESEND_API_KEY` (and a verified `RESEND_FROM_EMAIL` domain) in Vercel production. App-sent email (invites, digests, announcements) does not send today | ❌ Open | Owner (configuration) |
| 2 | Turn on production synthetic checks: run `scripts/prod-synthetic-bootstrap.mjs`, then set the `SYNTHETIC_*` secret and variables | ❌ Open | Owner (one-time setup) |
| 3 | Decide on and schedule the weekly progress digest | ❌ Open | Owner decision |
| 4 | One live guardian email round trip (the queue has worked since 2026-09-26) | ⚠️ Verify with the first pilot | Joint |
| 5 | Onboard the Biblos trial with a guided walkthrough; check the feedback triage queue daily during the pilot | ⚠️ Not started | Owner |

Nothing on the product side blocks a closed beta.

### Before a public launch

| Gap | Why it matters | Size |
|---|---|---|
| Self-serve tenant signup and trial | Without it, every sale needs manual setup; no marketing funnel | Medium: new public flow, Stripe trial, spam protection |
| Live billing path proven | No org has ever reached a Stripe customer; checkout, webhooks and portal are tested only against local mocks | Small: one real test-mode then live transaction |
| Adoption evidence | 2 active users in 30 days. Pilot feedback is the signal the next roadmap should be based on | Pilot period |
| Teacher ↔ guardian messaging | Last item on Council Review 3's gap list; messaging now works, so this is a scoped extension | Small–medium |
| Rubric grading | Expected by schools; the gradebook grid is the base to build on | Medium |
| SSO (Google / Microsoft) | Schools and larger churches expect it; Supabase supports it | Small–medium |
| Push notifications | Engagement parity with church apps | Medium |

### Deliberately deferred

- **SCORM** (ADR-2026-006, waiting for a customer contract). The block type exists in the schema with no player.
- **Hosted video.** Embeds are adequate for a beta.
- **Native apps.**
- **Content library.** A business decision (partner or produce) more than an engineering one.
- **Survey, flashcard and checklist blocks.** Defined in the schema but not buildable; either build them or remove them.

---

## 5. Recommendation

1. **Run the closed beta now.** Finish the three configuration items above, onboard Biblos properly, and recruit 2–3 more congregations, ideally one Christian school or Bible institute (the strongest fit) and one bilingual church.
2. **Build self-serve signup next**, with a Stripe trial. It's the single change that turns ChurchCore from a managed pilot into a product, and it proves the billing path at the same time.
3. **Let pilot feedback choose between the next three:** teacher↔guardian messaging, rubric grading, and ChMS integration. The triage workspace exists for exactly this. Each should get its own council document, as usual.
4. **Treat content as a business-development question.** Partnering with a curriculum publisher, or seeding a starter library built with the outline generator, would close the church-market gap faster than any feature.

---

## Sources

- **Code and schema:** `main` at `bbae2c9` (v0.36.1). Surface counts from `npm run test:surface -- --list`; block types from the `block_types` table and `src/components/builder/NodeForm.tsx`.
- **Previous assessment:** `docs/reviews/2026-09-19-council-review-3-*.md`.
- **Change history:** `CHANGELOG.md` 0.29.0–0.36.1; COUNCIL-2026-026 to -033.
- **Production metrics:** read-only queries against the production database on 2026-09-26.
- **Competitor columns:** general knowledge of each market category, not a fresh product-by-product check. Check specific competitor claims before using this in sales material.
