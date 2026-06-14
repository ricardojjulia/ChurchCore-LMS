# LMS Project HQ — Full Specification

> Self-contained spec for replicating the HQ / AI Council system in any repo.  
> Stack: **Next.js 14 App Router · TypeScript · Supabase (Postgres + RLS) · Anthropic API**

---

## 1. What It Is

HQ is a single-page governance and AI operations centre mounted at `/hq`. It gives a project team:

- A **12-agent AI council** — each agent has a fixed persona, layer, quick-prompts, and full streaming chat. Conversations are persisted per-agent in the DB.
- A **history view** — every council session (prompt + response) stored in full, filterable by agent.
- A **task engine** — kanban board with 6 statuses, priorities, and 3 source types (`manual`, `risk`, `council`). Full CRUD backed by DB.
- A **risk register** — risks with severity/probability scores; any risk can be converted to a mitigation task in one click.
- A **decision log** — records of every architectural/product/operational choice; created automatically on council review.
- **Built-in docs** — 7 static reference documents (Vision, Architecture, Schema, Security, Workflow, GitHub Governance, Roadmap) rendered as pre-formatted text with a copy button.
- A **council review trigger** — top-of-page feature input that fires a structured consensus prompt at the Product Manager agent, and simultaneously creates a decision record and a breakdown task.
- A **release checklist** — static pre-flight gates for shipping (schema, RLS, tests, docs, rollback).

Access requires authentication. RLS on all four DB tables restricts reads to `admin | manager | teacher` and writes to `admin | manager`.

---

## 2. Route & File Layout

```
src/app/hq/
  page.tsx          ← entire HQ (single 'use client' file, ~880 lines)

src/app/api/ai/
  route.ts          ← edge route that proxies requests to Anthropic API
```

No sub-routes. No server actions. All DB calls are made from the client via the Supabase browser client.

---

## 3. Database Schema

### 3.1 `hq_sessions`

Stores every prompt → response pair from the agent council.

```sql
CREATE TABLE IF NOT EXISTS public.hq_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL DEFAULT auth.uid(),
  agent_id    text        NOT NULL,   -- matches AGENTS key, e.g. 'architect'
  agent_name  text        NOT NULL,   -- display name, e.g. 'The Architect'
  prompt      text        NOT NULL,
  response    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_hq_sessions_user_agent ON public.hq_sessions(user_id, agent_id);
CREATE INDEX idx_hq_sessions_created    ON public.hq_sessions(created_at DESC);

ALTER TABLE public.hq_sessions ENABLE ROW LEVEL SECURITY;

-- Each user manages their own sessions
CREATE POLICY "hq_sessions: users manage own"
  ON public.hq_sessions FOR ALL
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins can see all sessions
CREATE POLICY "hq_sessions: admins read all"
  ON public.hq_sessions FOR SELECT
  USING (public.current_user_role() = 'admin');
```

### 3.2 `hq_tasks`

Kanban task engine.

```sql
CREATE TABLE IF NOT EXISTS public.hq_tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  status      text        NOT NULL DEFAULT 'backlog'
                          CHECK (status IN ('backlog','ready','in_progress','review','blocked','done')),
  owner       text,                   -- free-text agent or person name
  priority    text        NOT NULL DEFAULT 'P2'
                          CHECK (priority IN ('P0','P1','P2','P3')),
  source      text        NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('manual','risk','council')),
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_tasks: staff read all"
  ON public.hq_tasks FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_tasks: managers+ write"
  ON public.hq_tasks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_tasks: managers+ update"
  ON public.hq_tasks FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_tasks: admins delete"
  ON public.hq_tasks FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
```

### 3.3 `hq_risks`

Risk register.

```sql
CREATE TABLE IF NOT EXISTS public.hq_risks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  mitigation  text,
  severity    int         NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
  probability int         NOT NULL DEFAULT 3 CHECK (probability BETWEEN 1 AND 5),
  owner       text,
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_risks: staff read all"
  ON public.hq_risks FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_risks: managers+ write"
  ON public.hq_risks FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_risks: managers+ update"
  ON public.hq_risks FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_risks: admins delete"
  ON public.hq_risks FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
```

### 3.4 `hq_decisions`

Decision log / ADR tracker.

```sql
CREATE TABLE IF NOT EXISTS public.hq_decisions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  owner       text,
  status      text        NOT NULL DEFAULT 'Proposed'
                          CHECK (status IN ('Proposed','Accepted','Rejected','Superseded')),
  impact      text        NOT NULL DEFAULT 'Medium'
                          CHECK (impact IN ('Critical','High','Medium','Low')),
  created_by  uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hq_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hq_decisions: staff read all"
  ON public.hq_decisions FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin','manager','teacher'));

CREATE POLICY "hq_decisions: managers+ write"
  ON public.hq_decisions FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_decisions: managers+ update"
  ON public.hq_decisions FOR UPDATE TO authenticated
  USING  (public.current_user_role() IN ('admin','manager'))
  WITH CHECK (public.current_user_role() IN ('admin','manager'));

CREATE POLICY "hq_decisions: admins delete"
  ON public.hq_decisions FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
```

### 3.5 Seed Data

On first deploy, populate the three governance tables with bootstrap content:

**Decisions (5 rows):**
- "Use Supabase RLS as authorization source of truth" — Security Officer — Accepted — Critical
- "Model lessons as canvas block model (flat course_blocks table)" — The Architect — Accepted — High
- "Separate Project HQ governance from LMS runtime tables" — The Engineer — Accepted — Medium
- "shadcn/ui as UI component library (ADR-0012)" — The Architect — Accepted — Medium
- "Two-layer identity split: profiles.uid vs profiles.auth_id (ADR-0004)" — The Engineer — Accepted — Critical

**Risks (5 rows):**
- "RLS policy gaps may expose student records" — mitigation: "Policy tests for every student/teacher/admin path." — S5/P3 — Security Officer
- "Feature bloat could delay MVP" — mitigation: "Phase-gate roadmap and MVP acceptance criteria." — S4/P4 — Product Manager
- "AI tutor may provide unsupervised incorrect guidance" — mitigation: "Teacher-owned sources, retrieval citations, safe refusal patterns." — S4/P3 — AI Tutor Designer
- "Migration errors could corrupt identity split" — mitigation: "Full migration test suite before each push." — S5/P2 — The Engineer
- "Missing enrollment gates could allow open course access" — mitigation: "Enrollment RLS must be tested for every role." — S4/P3 — Security Officer

**Tasks (7 rows):**
- "Write RLS tests for enrollments" — backlog — The Tester — P0 — manual
- "Draft ADR-001: Canvas Block Model" — in_progress — The Architect — P1 — manual
- "Build course builder UI" — done — The Implementer — P0 — manual
- "Implement gradebook schema" — backlog — The Engineer — P1 — manual
- "Design AI tutor memory architecture" — backlog — AI Tutor Designer — P2 — manual
- "Create Playwright E2E test suite" — backlog — The Tester — P1 — manual
- "Set up GitHub Actions CI pipeline" — backlog — DevOps Officer — P1 — manual

Use `WHERE NOT EXISTS (SELECT 1 FROM public.hq_X LIMIT 1)` guards so seeds are idempotent.

---

## 4. The `/api/ai` Edge Route

All AI calls are proxied server-side so `ANTHROPIC_API_KEY` is never exposed to the browser.

```typescript
// src/app/api/ai/route.ts
import { NextRequest } from 'next/server'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  // Pipe SSE stream straight through for real-time streaming
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const data = await res.json()
  return Response.json(data, { status: res.status })
}
```

**Environment variable required:** `ANTHROPIC_API_KEY` in `.env.local` (server-side only, never committed).

**Request shape sent from client:**
```json
{
  "model": "claude-sonnet-4-6",
  "max_tokens": 16000,
  "stream": true,
  "system": "<agent persona>\n\n<project context>",
  "messages": [{ "role": "user|assistant", "content": "..." }]
}
```

The client reads the SSE stream and applies each `content_block_delta.text_delta` token to the trailing assistant message in state.

---

## 5. The 12 Agents

Each agent has: `id`, `name`, `emoji`, `role` (subtitle), `layer` (grouping), `color` (hex accent), `bg` (hex dark background for gradient), `quick` (array of 4 quick-prompt strings), `persona` (system prompt string).

Agents are grouped into 6 layers for the sidebar: **Executive, Build, Assurance, Operations, Learning, Insights, Knowledge, Vision**.

| id | name | emoji | layer | role |
|----|------|-------|-------|------|
| `architect` | The Architect | 🏛️ | Executive | System Design & Architecture |
| `product` | Product Manager | 🧭 | Executive | Roadmap, Scope & Prioritization |
| `engineer` | The Engineer | ⚙️ | Build | Schemas, APIs & Specs |
| `implementer` | The Implementer | 💻 | Build | Code & Deployment |
| `security` | Security Officer | 🛡️ | Assurance | RLS, Privacy & Threat Models |
| `tester` | The Tester | 🔬 | Assurance | QA & Test Strategy |
| `devops` | DevOps Officer | 🚀 | Operations | CI/CD, Environments & Releases |
| `administrator` | Administrator | 🗂️ | Operations | Academic Operations |
| `custodian` | Content Custodian | 📋 | Learning | Instructional Quality |
| `tutor` | AI Tutor Designer | 🧠 | Learning | Adaptive Learning & AI Tutor |
| `data` | Data Scientist | 📈 | Insights | Analytics & Learning Metrics |
| `writer` | Technical Writer | ✍️ | Knowledge | Docs, ADRs & Runbooks |
| `wildcard` | The Wildcard | 🃏 | Vision | Innovation & Provocation |

### Full agent definitions (copy verbatim)

```typescript
const AGENTS = {
  architect: {
    id: 'architect', name: 'The Architect', emoji: '🏛️',
    role: 'System Design & Architecture', layer: 'Executive',
    color: '#818cf8', bg: '#1e1b4b',
    quick: ['Design the full system topology','Decide multi-tenancy model','Write an ADR for learning objects','Map all integration boundaries'],
    persona: `You are The Architect, a senior technical architect designing a serverless, AI-native LMS on Vercel + Supabase. You think in systems, boundaries, trade-offs, failure modes, and long-term maintainability. Produce ADRs, topology diagrams, domain maps, and migration paths.`
  },
  product: {
    id: 'product', name: 'Product Manager', emoji: '🧭',
    role: 'Roadmap, Scope & Prioritization', layer: 'Executive',
    color: '#38bdf8', bg: '#082f49',
    quick: ['Prioritize MVP scope','Create user stories for gradebook','Define release milestones','Write acceptance criteria'],
    persona: `You are the Product Manager. You convert vision into epics, milestones, acceptance criteria, and release sequencing. You protect the MVP from bloat while preserving the larger platform vision.`
  },
  engineer: {
    id: 'engineer', name: 'The Engineer', emoji: '⚙️',
    role: 'Schemas, APIs & Specs', layer: 'Build',
    color: '#34d399', bg: '#022c22',
    quick: ['Write core database schema SQL','Design all RLS policies','Spec API routes','Define TypeScript interfaces'],
    persona: `You are The Engineer, a pragmatic senior engineer. Produce concrete SQL, API contracts, TypeScript types, Supabase policies, edge function designs, and implementation checklists. No hand-waving.`
  },
  implementer: {
    id: 'implementer', name: 'The Implementer', emoji: '💻',
    role: 'Code & Deployment', layer: 'Build',
    color: '#fbbf24', bg: '#451a03',
    quick: ['Build ModuleItemRenderer','Write auth middleware','Create course page','Implement enrollment function'],
    persona: `You are The Implementer, a full-stack developer writing production-ready Next.js, Supabase, SQL, and Vercel code. Include file paths, strict TypeScript, validation, and error handling.`
  },
  security: {
    id: 'security', name: 'Security Officer', emoji: '🛡️',
    role: 'RLS, Privacy & Threat Models', layer: 'Assurance',
    color: '#fb7185', bg: '#4c0519',
    quick: ['Threat model the LMS','Audit RLS policies','Design privacy controls','List OWASP risks'],
    persona: `You are the Security Officer. You threat-model everything: RLS, JWT, IDOR, uploads, storage policies, audit trails, secrets, RBAC, tenant isolation, FERPA/GDPR/COPPA-style privacy, and abuse cases.`
  },
  tester: {
    id: 'tester', name: 'The Tester', emoji: '🔬',
    role: 'QA & Test Strategy', layer: 'Assurance',
    color: '#f472b6', bg: '#500724',
    quick: ['Create RLS test suite','Write Playwright flows','Audit enrollment edge cases','Build release checklist'],
    persona: `You are The Tester. You produce unit, integration, e2e, security, accessibility, and performance tests. You think in edge cases, regressions, and release gates.`
  },
  devops: {
    id: 'devops', name: 'DevOps Officer', emoji: '🚀',
    role: 'CI/CD, Environments & Releases', layer: 'Operations',
    color: '#22d3ee', bg: '#164e63',
    quick: ['Design GitHub Actions pipeline','Define environments','Create release checklist','Plan rollback strategy'],
    persona: `You are the DevOps Officer. You design branches, environments, GitHub Actions, Vercel deployments, release notes, migrations, rollback plans, build logs, and operational runbooks.`
  },
  administrator: {
    id: 'administrator', name: 'Administrator', emoji: '🗂️',
    role: 'Academic Operations', layer: 'Operations',
    color: '#60a5fa', bg: '#172554',
    quick: ['Design course nomenclature','Build academic calendar','Set capacity rules','Define teacher assignment rules'],
    persona: `You are the Academic Administrator. You govern academic periods, course codes, enrollment windows, capacity, teacher assignments, waitlists, publishing rules, and registrar-style workflows.`
  },
  custodian: {
    id: 'custodian', name: 'Content Custodian', emoji: '📋',
    role: 'Instructional Quality', layer: 'Learning',
    color: '#fb923c', bg: '#431407',
    quick: ['Audit course completeness','Create pre-publish checklist','Improve module sequence','Write rubric standards'],
    persona: `You are the Content Custodian, guardian of instructional quality. You audit syllabi, outcomes, modules, learning objects, rubrics, completion criteria, naming, and pedagogical flow.`
  },
  tutor: {
    id: 'tutor', name: 'AI Tutor Designer', emoji: '🧠',
    role: 'Adaptive Learning & AI Tutor', layer: 'Learning',
    color: '#c084fc', bg: '#3b0764',
    quick: ['Design AI tutor memory','Create adaptive path logic','Plan spaced repetition','Write tutor guardrails'],
    persona: `You are the AI Tutor Designer. You design adaptive learning, safe tutoring, retrieval context, learner memory, knowledge graphs, spaced repetition, and teacher-controlled AI boundaries.`
  },
  data: {
    id: 'data', name: 'Data Scientist', emoji: '📈',
    role: 'Analytics & Learning Metrics', layer: 'Insights',
    color: '#a3e635', bg: '#1a2e05',
    quick: ['Define learning KPIs','Design analytics schema','Create retention model','Build teacher dashboard metrics'],
    persona: `You are the Data Scientist. You define learning analytics, engagement metrics, progress models, grade insights, retention signals, and responsible AI/data practices.`
  },
  writer: {
    id: 'writer', name: 'Technical Writer', emoji: '✍️',
    role: 'Docs, ADRs & Runbooks', layer: 'Knowledge',
    color: '#e5e7eb', bg: '#27272a',
    quick: ['Write README','Create ADR template','Draft contributor guide','Generate release notes'],
    persona: `You are the Technical Writer. You create clear docs, ADRs, runbooks, onboarding guides, API references, release notes, and project memory summaries.`
  },
  wildcard: {
    id: 'wildcard', name: 'The Wildcard', emoji: '🃏',
    role: 'Innovation & Provocation', layer: 'Vision',
    color: '#d946ef', bg: '#4a044e',
    quick: ['Pitch a never-seen feature','Make this viral','Gamify the LMS','Design future-state experience'],
    persona: `You are The Wildcard. You reject conventional LMS thinking. Propose bold, weird, feasible ideas inspired by games, social platforms, creative tools, AI, and learning science.`
  },
}
```

**Project context injected into every system prompt:**
```
Project: ChurchCore LMS / LMS Project HQ
Target Stack: Next.js App Router, TypeScript, Supabase, Postgres RLS, Storage, Realtime, Edge Functions, Vercel.
Core Pattern: AI council + institutional memory + docs + tasks + ADRs + risk register + GitHub-ready governance.
Security Standard: RLS is source of truth. Never trust client-side checks. Every user-visible data path must have policy tests.
Product Goal: Fast, simple, ministry/academic-ready LMS with course creation, modules, assignments, gradebook, certificates, analytics, and AI tutor support.
```

---

## 6. The 7 Built-In Documents

Static content — no DB backing, rendered as `<pre>` blocks with a copy button.

| id | icon | title |
|----|------|-------|
| `vision` | 🎯 | Vision |
| `architecture` | 🏛️ | Architecture |
| `schema` | 🗄️ | Schema Blueprint |
| `rls` | 🛡️ | Security + RLS |
| `workflow` | ⚙️ | Workflow Engine |
| `github` | 🔀 | GitHub Governance |
| `roadmap` | 🗺️ | Roadmap |

Each doc body is a plain markdown string rendered inside a monospace `<pre>` tag. No markdown parsing — whitespace formatting is intentional.

---

## 7. Council Review Flow

The **Run Council Review** button in the top bar:

1. Takes the text from the feature input (default: `"AI-assisted gradebook with teacher override and student progress explanations"`).
2. Switches the active agent to `product` and the view to `agents`.
3. Fires `sendMessage()` with this structured prompt:
   ```
   Run a council review for the proposed feature. Return:
   1. Executive summary
   2. Recommendation
   3. Architecture impact
   4. Data model impact
   5. Security/RLS risks
   6. QA acceptance criteria
   7. UX concerns
   8. Implementation phases
   9. Decision record draft

   Feature: <feature text>
   ```
4. In parallel, inserts into `hq_decisions`: `{ title: "Council review: <feature>", owner: "Product Manager", status: "Proposed", impact: "High" }`.
5. In parallel, inserts into `hq_tasks`: `{ title: "Break down: <feature>", owner: "Product Manager", priority: "P1", status: "backlog", source: "council" }`.

---

## 8. Risk → Task Conversion

On the Risks view, each risk row has a `→ Task` button. Clicking it:

1. Sets `savingRiskId` to the risk ID (shows `…` spinner, disables button).
2. Calls `dbAddTask("Mitigate: <risk.title>", risk.owner, 'P1', 'risk')`.
3. Inserts into `hq_tasks` with `source: 'risk'` and `priority: 'P1'`.
4. Clears `savingRiskId`.
5. Navigates to the Tasks view (`setView('tasks')`).

The new task appears immediately in the `backlog` lane via optimistic state update.

---

## 9. Data Flow & State

All state lives in the single `HQPage` component. Key state:

```typescript
view          : string          // current nav: dashboard|agents|docs|history|tasks|decisions|risks|release
activeAgent   : string          // current agent id
activeDoc     : string          // current doc id
messages      : Record<string, ChatMessage[]>  // per-agent chat threads, keyed by agent id
sessions      : HqSession[]     // all persisted council sessions from DB
tasks         : HqTask[]        // from DB
risks         : HqRisk[]        // from DB
decisions     : HqDecision[]    // from DB
selectedSession: HqSession|null // history detail panel
historyFilter : string          // 'all' or agent id
input         : string          // chat textarea value
loading       : boolean         // streaming in progress
feature       : string          // council review subject
copied        : string|null     // id of most recently copied block
newTaskTitle  : string          // add-task input
savingRiskId  : string|null     // risk being converted to task
```

**On mount:**
- `supabase.auth.getUser()` → stores `authUidRef.current`
- `hq_sessions` fetched → chat threads reconstructed per agent by pushing `user` + `assistant` messages in insertion order
- `hq_tasks` fetched (ordered by `created_at DESC`)
- `hq_risks` fetched (ordered by `severity DESC`)
- `hq_decisions` fetched (ordered by `created_at DESC`)

**Streaming:** Uses `ReadableStream` + `TextDecoder`. Each SSE line starting with `data: ` is parsed as JSON. The `content_block_delta` event's `delta.text` is appended to `streamingRef.current`, which patches the last assistant message in state via `setMessages`.

After stream closes, the full `prompt` + `response` are inserted into `hq_sessions`.

---

## 10. Navigation Rail

8-item vertical rail on the left (220px wide, collapses to 80px icon-only at ≤1000px):

```
◈  HQ         → view: dashboard
⚡  Agents     → view: agents
📄  Docs       → view: docs
🕒  History    → view: history
✅  Tasks      → view: tasks
🧠  Memory     → view: decisions
⚠️  Risks      → view: risks
🚢  Release    → view: release
```

Footer pills: `Vercel` (green), `Supabase` (green), `RLS-first` (pink).

---

## 11. View Layouts

### Dashboard
3-column CSS grid. Panels:
- **Hero** (span 2): headline, subtitle, 4 stat counters (Agents / Docs / Council Sessions / Active Tasks)
- **Operating Model**: 5-step numbered timeline
- **Agent Council** (span 2): 4-column grid of agent cards, each clickable → opens in Agents view

### Agents
Horizontal split:
- **Left sidebar** (260px): agents grouped by layer, showing name + response count
- **Right**: chat panel with agent header (emoji, name, role, gradient bg), 4 quick-prompt chips, scrollable message thread, composer textarea

### Docs
Horizontal split:
- **Left sidebar** (260px): doc list buttons
- **Right**: `<pre>` rendered doc body + copy button

### History
Horizontal split:
- **Left sidebar** (320px): agent filter dropdown + session list (agent emoji/name, timestamp, prompt preview)
- **Right**: detail panel showing selected session's prompt and response with copy buttons; "Open in Agent →" button

### Tasks
Full-width vertical panel:
- Header: active count + add-task input (Enter key or Add Task button)
- Kanban: 6-column grid (`backlog` → `ready` → `in_progress` → `review` → `blocked` → `done`)
- Each card: title, owner, priority pill, source pill (if not manual), status dropdown, delete button

### Memory (Decisions)
Full-width list. Each row: title + timestamp, owner, status pill, impact pill (amber).

### Risks
Full-width list. Each row (4-column grid): title + mitigation text, severity/probability score, owner, → Task button.

### Release
- Wide panel: pre-flight checklist (7 checkboxes)
- Narrow panel: environment matrix (local/preview/staging/production with pills)

---

## 12. Styling

All styles are injected via a single `<style dangerouslySetInnerHTML>` tag at the bottom of the component. No CSS files, no Tailwind on HQ (the rest of the app uses Tailwind; HQ uses bespoke CSS in a dark design system).

**Design tokens:**
```
Background:    #09090b  (app root)
Surface:       #111116  (panels)
Sidebar bg:    #0f0f14
Input bg:      #18181f
Border:        #24242a  (primary), #262631 (panels), #30303a (inputs)
Text primary:  #e5e7eb
Text muted:    #71717a, #9ca3af, #a1a1aa
Accent:        #6366f1  (indigo — buttons, links)
```

**Per-agent theming:** Each agent card, header, and history row is tinted with the agent's `color` (text) and `bg` (gradient). Implemented via `data-agent="<id>"` attribute selectors generated at module load time from the `AGENTS` map.

**Message bubbles:**
- User: `background: #1e1b4b; border-color: #3730a3` (right-aligned, max 72% width)
- Assistant: `background: #15151b; border-color: #282833` (full width)
- Font: `JetBrains Mono, Menlo, monospace` at 12.5px

---

## 13. TypeScript Interfaces

```typescript
interface HqSession {
  id: string
  user_id: string
  agent_id: string
  agent_name: string
  prompt: string
  response: string
  created_at: string
}

interface HqTask {
  id: string
  title: string
  status: 'backlog' | 'ready' | 'in_progress' | 'review' | 'blocked' | 'done'
  owner: string | null
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  source: 'manual' | 'risk' | 'council'
  created_at: string
}

interface HqRisk {
  id: string
  title: string
  mitigation: string | null
  severity: number   // 1–5
  probability: number // 1–5
  owner: string | null
  created_at: string
}

interface HqDecision {
  id: string
  title: string
  owner: string | null
  status: string
  impact: string
  created_at: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ts: string
  sessionId?: string  // set after DB insert
}
```

---

## 14. Supabase Client Setup

HQ uses the browser (client-side) Supabase client. The component uses `useMemo` to create it once:

```typescript
const supabase = useMemo(() => createClient(), [])
```

The client is created from `@supabase/ssr` (browser client variant) with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

---

## 15. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
ANTHROPIC_API_KEY=<secret — server-side only, never expose to client>
```

---

## 16. RLS Helper Function Dependency

HQ's RLS policies use `public.current_user_role()`. This function must exist in the DB before the HQ tables are created. It must read from a table that does **not** create a recursive policy cycle with `profiles`. In this project it reads from `public.profile_roles`:

```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profile_roles
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;
```

If replicating in a repo without the `profile_roles` pattern, replace with whatever role-lookup mechanism that repo uses — the only requirement is that it returns a value comparable to `'admin' | 'manager' | 'teacher' | 'student'` without causing infinite recursion on the `profiles` table.

---

## 17. Checklist for Replication

- [ ] Create `hq_sessions` table with RLS policies
- [ ] Create `hq_tasks` table with RLS policies
- [ ] Create `hq_risks` table with RLS policies
- [ ] Create `hq_decisions` table with RLS policies
- [ ] Seed all three governance tables
- [ ] Create `src/app/api/ai/route.ts` (edge runtime, proxies Anthropic)
- [ ] Add `ANTHROPIC_API_KEY` to server environment (never committed)
- [ ] Create `src/app/hq/page.tsx` as `'use client'` component
- [ ] Copy `AGENTS` map verbatim (13 agents)
- [ ] Copy `DOCS` array verbatim (7 docs)
- [ ] Copy `PROJECT_CONTEXT` string (update project name/stack as needed)
- [ ] Copy `CONSENSUS_PROMPT` string
- [ ] Verify `current_user_role()` function exists and is non-recursive
- [ ] Add `/hq` to auth-protected routes in middleware
- [ ] Add "HQ" link to Navbar (visible to admin/manager/teacher only)
