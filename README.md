# ChurchCore LMS

> A fast, secure, ministry-ready Learning Management System built for churches and faith communities.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss)](https://tailwindcss.com)

---

## Overview

ChurchCore LMS is a full-stack learning platform purpose-built for church organizations. It supports multi-role users (students, teachers, managers, admins), a block-based course builder, a full gamification system, AI-powered weekly summaries, and WCAG 2.1 AA accessibility — all backed by Row Level Security in PostgreSQL.

**This is not a generic LMS wrapper.** Every feature was designed around the specific needs of ministry education: volunteer training, discipleship programs, leadership development, and pastoral continuing education.

---

## Features

### Learning Experience
- **Block-based course builder** — pages, videos, quizzes, assignments, file resources, external links, and discussion threads
- **Interactive learning shell** — collapsible module sidebar, prev/next navigation, block-level progress tracking
- **Auto-graded quizzes** — MCQ with per-question point values and instant feedback
- **Assignment submission** — text submissions with instructor grading and feedback
- **Discussion threads** — per-block discussion boards visible to all enrolled students
- **Video embedding** — YouTube, Vimeo, or native HTML5 video

### Gamification
- **XP system** — awarded on block completion, quiz submission (grade-scaled), assignment grading, and course completion
- **10-level progression** — automatic level-up via `calculate_level()` SQL function
- **Leaderboard** — top 50 students with podium, level bars, and personal rank
- **Certificates** — auto-issued on course completion with letter grade and certificate number

### Communication
- **Threaded messaging** — direct and group message threads with real-time unread counts
- **Announcements** — staff-authored with audience targeting
- **Notifications** — in-app bell with full `/notifications` page, type icons, and dismiss
- **AI weekly summary** — Claude-powered personalized learning summary for students

### Administration
- **Role system** — `admin`, `manager`, `teacher`, `student` with ENUM enforcement
- **User management** — paginated admin panel with role assignment and XP/level display
- **Program tracks** — define pathways such as diplomas, associate degree year two, discipleship, residency, and leadership tracks
- **Course blueprints** — reusable catalog definitions with course code, credits, and track placement
- **Terms and sections** — schedule blueprints into real offerings with delivery format, access windows, and capacity
- **Course academic placement** — attach a course to a blueprint and see the linked track, sections, and term context from the course screen
- **Cohorts** — move groups of learners through sections together
- **Bulk enrollment** — staff search and enroll/unenroll students per course
- **Course analytics** — per-course class stats, at-risk detection, CSV export
- **Grading queue** — `/submissions` with status filters and inline grade + feedback forms

### Infrastructure
- **Row Level Security** — all tables secured at DB layer; `current_user_uid()` and `current_user_role()` SECURITY DEFINER helpers prevent RLS recursion
- **Materialized view** — `mv_academic_performance` with SECURITY DEFINER access functions
- **Global search** — ⌘K modal searching courses, announcements, and people
- **Collapsible side navigation** — icon-rail (56 px) or full panel (240 px); collapse preference persisted to `localStorage`; smooth CSS width + label-opacity transitions; mobile falls back to the fixed bottom nav
- **CI/CD pipeline** — GitHub Actions: lint → typecheck → unit tests → build on every push; e2e on PRs; manual approval gate for production deploys; CODEOWNERS on migrations and workflows
- **Test suite** — Vitest with `@testing-library/react`; 72+ unit tests across hooks, utilities, and lib; per-directory coverage thresholds
- **Error boundaries** — route-level error boundaries for admin, courses, course detail, learn shell, and dashboard; never expose stack traces in production DOM
- **Mobile bottom nav** — 5-tab fixed nav with message badges, iOS safe-area insets
- **WCAG 2.1 AA** — skip link, `aria-expanded`, `role="dialog"`, `aria-live`, `:focus-visible`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5 |
| Database | Supabase (PostgreSQL 15) |
| Auth | Supabase Auth (magic link + email/password) |
| ORM | Supabase JS client (PostgREST) |
| Styling | Tailwind CSS 3 + shadcn/ui |
| Icons | Lucide React |
| AI | Anthropic Claude (claude-haiku-4-5) + OpenAI (embeddings) |
| Testing | Vitest + Testing Library |
| CI/CD | GitHub Actions |
| Deployment | Vercel (recommended) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic](https://anthropic.com) API key (for AI features)

### 1. Clone and install

```bash
git clone https://github.com/ricardojjulia/ChurchCore-LMS.git
cd ChurchCore-LMS
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # never committed, never client-side
ANTHROPIC_API_KEY=your-anthropic-key               # server-side only
```

> **Security:** `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` are server-side only. They must never be prefixed with `NEXT_PUBLIC_` and must never appear in client components. All AI calls are proxied through `/api/ai`.

### 3. Apply database migrations

```bash
npx supabase db push
```

This runs all 29 migrations in order, creating tables, RLS policies, helper functions, triggers, and the academic performance materialized view.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Optional demo reset

The repo includes a guarded destructive reset that keeps one retained admin user and rebuilds a full demonstration school with tracks, blueprints, terms, sections, cohorts, users, content, enrollments, calendar events, announcements, and notifications.

```bash
npm run demo:reset -- --confirm --retain-email=you@example.com
```

Read [docs/demo-data.md](./docs/demo-data.md) before using it against any hosted database.

---

## Project Structure

```
src/
├── app/
│   ├── actions/               # Server actions (learning, enrollment, messages, cohorts, …)
│   ├── api/                   # API routes (ai proxy, search, calendar, health)
│   ├── courses/[id]/
│   │   ├── build/             # Course builder
│   │   ├── learn/             # Learning shell
│   │   ├── complete/          # Completion + certificate page
│   │   ├── enroll/            # Staff bulk enrollment
│   │   ├── analytics/         # Instructor analytics
│   │   └── submissions/       # Grading queue
│   ├── admin/                 # Cohorts, sections, terms, blueprints, users, health
│   ├── dashboard/             # Role-aware dashboard
│   ├── leaderboard/           # XP leaderboard
│   ├── notifications/         # Full notification center
│   ├── performance/           # Student GPA + progress
│   └── certificates/          # Earned certificates
├── components/
│   ├── cohorts/               # UserSearchCombobox
│   ├── dashboard/             # StudentDashboard, InstructorDashboard, AdminDashboard
│   ├── layout/                # Sidebar*, GlobalSearch, MobileBottomNav, NotificationBell
│   └── learning/              # LearningShell, BlockPlayer, QuizPlayer, DiscussionPlayer, …
├── hooks/                     # useRealtimeChannel, useNotifications, useMessages
├── lib/
│   ├── auth/                  # permissions helpers (isAdmin, isStaff, …)
│   ├── monitoring.ts          # captureError() — error ID generation + logging
│   └── queries/               # getHealthChecks
├── tests/                     # Vitest setup, e2e specs
├── types/                     # Shared TypeScript interfaces
└── utils/
    ├── supabase/              # client / server / service helpers + __mocks__
    ├── grading.ts             # calculatePercentage, calculateLetterGrade, isPassing
    └── certificate.ts         # formatCompletionDate, generateCertificateData
.github/
├── workflows/                 # ci.yml, e2e.yml, release.yml
└── CODEOWNERS
docs/
├── decisions/                 # ADR-2025-001 through ADR-2025-007
├── HOWTO-sidebar-nav.md       # Sidebar customisation guide
├── github-setup.md            # Branch protection + secrets reference
└── testing.md                 # Unit / coverage / e2e guide
supabase/
├── functions/search-users/    # Edge Function — role-gated user search with audit log
├── migrations/                # 49 ordered SQL migrations
└── seed.test.sql              # Deterministic test seed (fixed UUIDs)
scripts/
└── ci-setup-test-env.mjs      # CI helper — sets test-user passwords via Admin API
```

---

## Architecture Decisions

### RLS and Identity

All authorization is enforced at the database layer via Row Level Security. Two SECURITY DEFINER helper functions break the recursion that would occur if policies directly queried `public.profiles`:

```sql
current_user_uid()   -- returns profiles.uid for the authenticated user
current_user_role()  -- returns profiles.role enum value
```

These helpers read from `public.profile_roles`, a lightweight lookup table populated by a trigger on `profiles`, rather than querying `profiles` directly.

### Server vs. Client Components

- **Server Components** (default): data fetching, auth checks, page shells
- **Client Components** (`'use client'`): interactivity — QuizPlayer, DiscussionPlayer, GlobalSearch, MobileBottomNav, NotificationBell
- **Server Actions** (`'use server'`): mutations — all writes go through `src/app/actions/`

### XP and Level System

XP is awarded atomically via the `award_xp(uid, amount)` SECURITY DEFINER function, which increments `profiles.xp_points` and recomputes `profiles.current_level` using `calculate_level(xp)` in a single transaction. Level thresholds: 1→100→250→500→1000→2000→4000→8000→15000→30000 XP.

---

## Documentation

| Document | Purpose |
|---|---|
| [HOWTO-sidebar-nav.md](./docs/HOWTO-sidebar-nav.md) | Adding links, changing icons, cookie persistence, hiding on specific routes |
| [testing.md](./docs/testing.md) | Unit tests, coverage thresholds, e2e setup, test users |
| [github-setup.md](./docs/github-setup.md) | Branch protection, required secrets, status check configuration |
| [academic-program-workflows.md](./docs/academic-program-workflows.md) | Program tracks, blueprints, terms, sections, cohorts, and demo workflows |
| [demo-data.md](./docs/demo-data.md) | Destructive demo reset command and generated sample programs |
| [decisions/](./docs/decisions/) | Architecture Decision Records (ADR-2025-001 through ADR-2025-007) |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for commit conventions, branch naming, PR requirements, and code discipline procedures.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for a full version history.

---

## License

[GNU Affero General Public License v3.0](./LICENSE) © 2026 Ricardo Julia
