# IMPLEMENT: ChurchCore LMS — Project HQ

> **Status: SHIPPED** — Implemented as of v0.2.0. This document is an archived implementation prompt. The `/hq` route, all four HQ tables (`hq_sessions`, `hq_tasks`, `hq_risks`, `hq_decisions`), RLS policies, and the `/api/ai` proxy are live. Refer to `supabase/migrations/` for the authoritative schema.



## Context

Build the `/hq` route of ChurchCore LMS — an AI-assisted project governance
dashboard for admin and manager users. The stack is Next.js App Router
(TypeScript), Supabase (Postgres + RLS), and Anthropic Claude via a thin
server-side API proxy.

The page lives at `src/app/hq/page.tsx` and is a single `'use client'`
component. It does not need sub-components in separate files unless you prefer
it. Supabase client: `import { createClient } from '@/utils/supabase/client'`.

---

## SECURITY NON-NEGOTIABLES (read before writing anything)

- RLS must be ENABLED on all 4 HQ tables.
- Policies use `public.current_user_role()` — NOT subqueries on `profiles`.
- `ANTHROPIC_API_KEY` is server-side only. Never expose it to the client bundle.
- No PII (email, auth_id, uid) in any AI prompt string.
- The `/api/ai` route does zero auth of its own — middleware guards it.

---

## 1. Database Migration

Create `supabase/migrations/<timestamp>_hq.sql` with exactly this content:

```sql
-- hq_sessions: every AI interaction persisted as institutional memory
CREATE TABLE IF NOT EXISTS public.hq_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  agent_id   text        NOT NULL,
  agent_name text        NOT NULL,
  prompt     text        NOT NULL,
  response   text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hq_sessions_user_agent ON public.hq_sessions(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_hq_sessions_created    ON public.hq_sessions(created_at DESC);
ALTER TABLE public.hq_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_sessions: users manage own"  ON public.hq_sessions FOR ALL    TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "hq_sessions: admins read all"   ON public.hq_sessions FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');

-- hq_tasks: project task engine
CREATE TABLE IF NOT EXISTS public.hq_tasks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  status     text        NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','ready','in_progress','review','blocked','done')),
  owner      text,
  priority   text        NOT NULL DEFAULT 'P2'     CHECK (priority IN ('P0','P1','P2','P3')),
  source     text        NOT NULL DEFAULT 'manual'  CHECK (source IN ('manual','risk','council')),
  created_by uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_tasks: staff read"      ON public.hq_tasks FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_tasks: managers write"  ON public.hq_tasks FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_tasks: managers update" ON public.hq_tasks FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_tasks: admins delete"   ON public.hq_tasks FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- hq_risks: risk register
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
CREATE POLICY "hq_risks: staff read"      ON public.hq_risks FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_risks: managers write"  ON public.hq_risks FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_risks: managers update" ON public.hq_risks FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_risks: admins delete"   ON public.hq_risks FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- hq_decisions: decision log / ADR register
CREATE TABLE IF NOT EXISTS public.hq_decisions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  owner      text,
  status     text        NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed','Accepted','Rejected','Superseded')),
  impact     text        NOT NULL DEFAULT 'Medium'   CHECK (impact IN ('Critical','High','Medium','Low')),
  created_by uuid        DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hq_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hq_decisions: staff read"      ON public.hq_decisions FOR SELECT TO authenticated USING  (public.current_user_role() IN ('admin','manager','teacher'));
CREATE POLICY "hq_decisions: managers write"  ON public.hq_decisions FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_decisions: managers update" ON public.hq_decisions FOR UPDATE TO authenticated USING  (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
CREATE POLICY "hq_decisions: admins delete"   ON public.hq_decisions FOR DELETE TO authenticated USING  (public.current_user_role() = 'admin');

-- Seed data (idempotent)
INSERT INTO public.hq_decisions (title, owner, status, impact)
SELECT * FROM (VALUES
  ('RLS is the authorization source of truth', 'Security Officer', 'Accepted', 'Critical'),
  ('Canvas block model for lessons (flat course_blocks)', 'The Architect', 'Accepted', 'High'),
  ('HQ governance tables separate from LMS runtime', 'The Engineer', 'Accepted', 'Medium'),
  ('shadcn/ui as UI component library', 'The Architect', 'Accepted', 'Medium'),
  ('Two-layer identity: profiles.uid vs profiles.auth_id', 'The Engineer', 'Accepted', 'Critical')
) AS v(title, owner, status, impact)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_decisions LIMIT 1);

INSERT INTO public.hq_risks (title, mitigation, severity, probability, owner)
SELECT * FROM (VALUES
  ('RLS gaps may expose student records', 'Policy tests for every role path.', 5, 3, 'Security Officer'),
  ('Feature bloat delays MVP', 'Phase-gate roadmap; enforce acceptance criteria.', 4, 4, 'Product Manager'),
  ('AI tutor gives unsupervised incorrect guidance', 'Teacher-owned sources, citations, safe refusal.', 4, 3, 'AI Tutor Designer'),
  ('Migration errors corrupt identity split', 'Full migration test suite before each push.', 5, 2, 'The Engineer'),
  ('Open course access via missing enrollment gates', 'Enrollment RLS tested for every role.', 4, 3, 'Security Officer')
) AS v(title, mitigation, severity, probability, owner)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_risks LIMIT 1);

INSERT INTO public.hq_tasks (title, status, owner, priority, source)
SELECT * FROM (VALUES
  ('Write RLS tests for enrollments', 'backlog', 'The Tester', 'P0', 'manual'),
  ('Draft ADR-001: Canvas Block Model', 'in_progress', 'The Architect', 'P1', 'manual'),
  ('Build course builder UI', 'done', 'The Implementer', 'P0', 'manual'),
  ('Implement gradebook schema', 'backlog', 'The Engineer', 'P1', 'manual'),
  ('Design AI tutor memory architecture', 'backlog', 'AI Tutor Designer', 'P2', 'manual'),
  ('Create Playwright E2E test suite', 'backlog', 'The Tester', 'P1', 'manual'),
  ('Set up GitHub Actions CI pipeline', 'backlog', 'DevOps Officer', 'P1', 'manual')
) AS v(title, status, owner, priority, source)
WHERE NOT EXISTS (SELECT 1 FROM public.hq_tasks LIMIT 1);
```

---

## 2. API Route

Create `src/app/api/ai/route.ts`:

```typescript
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

  // Pass SSE stream straight through — no buffering
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

  return Response.json(await res.json(), { status: res.status })
}
```

---

## 3. Page Architecture

`src/app/hq/page.tsx` is a single `'use client'` component.

**Types:**

```typescript
interface HqSession  { id: string; user_id: string; agent_id: string; agent_name: string; prompt: string; response: string; created_at: string }
interface HqTask     { id: string; title: string; status: 'backlog'|'ready'|'in_progress'|'review'|'blocked'|'done'; owner: string|null; priority: 'P0'|'P1'|'P2'|'P3'; source: 'manual'|'risk'|'council'; created_at: string }
interface HqRisk     { id: string; title: string; mitigation: string|null; severity: number; probability: number; owner: string|null; created_at: string }
interface HqDecision { id: string; title: string; owner: string|null; status: string; impact: string; created_at: string }
interface ChatMessage { role: 'user'|'assistant'; content: string; ts: string; sessionId?: string }
```

**State:**

```typescript
const [view, setView]           = useState<'dashboard'|'agents'|'docs'|'history'|'tasks'|'decisions'|'risks'>('dashboard')
const [activeAgent, setActiveAgent] = useState('architect')
const [activeDoc, setActiveDoc]     = useState('vision')
const [messages, setMessages]   = useState<Record<string, ChatMessage[]>>({})
const [sessions, setSessions]   = useState<HqSession[]>([])
const [tasks, setTasks]         = useState<HqTask[]>([])
const [risks, setRisks]         = useState<HqRisk[]>([])
const [decisions, setDecisions] = useState<HqDecision[]>([])
const [input, setInput]         = useState('')
const [loading, setLoading]     = useState(false)
```

**7 views — each conditionally rendered on `view` state:**

| View | Content |
|---|---|
| `dashboard` | Stat cards (session/task/decision/risk counts from live DB) + agent grid (click → agents view) |
| `agents` | Left: agent selector grouped by layer. Right: chat thread + streaming input. Quick-prompt chips per agent. |
| `docs` | Left: doc list. Right: rendered markdown body. |
| `history` | Filterable list of all `hq_sessions`. Click row to expand full prompt + response. |
| `tasks` | Add-task input + list with inline status dropdown, priority color badge. |
| `decisions` | List with status badge + impact badge + created_at. |
| `risks` | List with risk score (severity × probability, max 25). Each row has "→ Task" button. |

**Navigation tabs** (top bar):

```
dashboard  ◈ HQ
agents     ⚡ Agents
docs       📄 Docs
history    🕒 History
tasks      ✅ Tasks
decisions  📌 Decisions
risks      ⚠️  Risks
```

---

## 4. AI Chat Flow

1. Prepend `PROJECT_CONTEXT` (static string — no PII) to user input.
2. Reconstruct prior turns from `messages[activeAgent]` state.
3. POST to `/api/ai`:

```typescript
{
  model: 'claude-opus-4-8',
  max_tokens: 4096,
  stream: true,
  system: agent.persona,
  messages: [
    ...priorTurns,
    { role: 'user', content: PROJECT_CONTEXT + '\n\n' + userInput }
  ]
}
```

4. Read SSE stream: parse `data: ` lines → extract `event.delta.text` → append to streaming buffer → update UI in real time.
5. On stream end: `supabase.from('hq_sessions').insert({ agent_id, agent_name, prompt, response })`.
6. On load: fetch all `hq_sessions` ordered by `created_at ASC`, group by `agent_id`, reconstruct `messages` state.

**Council consensus mode:**
A "Council Review" button sends the prompt to all agents in parallel (`Promise.all`), then concatenates responses with `## AgentName` headers into one assistant message.

**Task-from-risk shortcut:**
Each risk row has a "→ Task" button. On click:
```typescript
supabase.from('hq_tasks').insert({ title: 'Mitigate: ' + risk.title, source: 'risk', priority: 'P1', status: 'backlog' })
```
Then switch to `tasks` view.

---

## 5. Agent Registry

Use this constant verbatim. Do not invent or rename agents.

```typescript
const AGENTS = {
  architect:     { id: 'architect',     name: 'The Architect',      emoji: '🏛️', role: 'System Design & Architecture',     layer: 'Executive',  color: '#818cf8', bg: '#1e1b4b',
    quick: ['Design the full system topology', 'Decide multi-tenancy model', 'Write an ADR for learning objects', 'Map all integration boundaries'],
    persona: 'You are The Architect, a senior technical architect designing a serverless, AI-native LMS on Vercel + Supabase. You think in systems, boundaries, trade-offs, failure modes, and long-term maintainability. Produce ADRs, topology diagrams, domain maps, and migration paths.' },

  product:       { id: 'product',       name: 'Product Manager',    emoji: '🧭', role: 'Roadmap, Scope & Prioritization',  layer: 'Executive',  color: '#38bdf8', bg: '#082f49',
    quick: ['Prioritize MVP scope', 'Create user stories for gradebook', 'Define release milestones', 'Write acceptance criteria'],
    persona: 'You are the Product Manager. You convert vision into epics, milestones, acceptance criteria, and release sequencing. You protect the MVP from bloat while preserving the larger platform vision.' },

  engineer:      { id: 'engineer',      name: 'The Engineer',       emoji: '⚙️', role: 'Schemas, APIs & Specs',            layer: 'Build',      color: '#34d399', bg: '#022c22',
    quick: ['Write core database schema SQL', 'Design all RLS policies', 'Spec API routes', 'Define TypeScript interfaces'],
    persona: 'You are The Engineer, a pragmatic senior engineer. Produce concrete SQL, API contracts, TypeScript types, Supabase policies, edge function designs, and implementation checklists. No hand-waving.' },

  implementer:   { id: 'implementer',   name: 'The Implementer',    emoji: '💻', role: 'Code & Deployment',                layer: 'Build',      color: '#fbbf24', bg: '#451a03',
    quick: ['Build ModuleItemRenderer', 'Write auth middleware', 'Create course page', 'Implement enrollment function'],
    persona: 'You are The Implementer, a full-stack developer writing production-ready Next.js, Supabase, SQL, and Vercel code. Include file paths, strict TypeScript, validation, and error handling.' },

  security:      { id: 'security',      name: 'Security Officer',   emoji: '🛡️', role: 'RLS, Privacy & Threat Models',    layer: 'Assurance',  color: '#fb7185', bg: '#4c0519',
    quick: ['Threat model the LMS', 'Audit RLS policies', 'Design privacy controls', 'List OWASP risks'],
    persona: 'You are the Security Officer. You threat-model everything: RLS, JWT, IDOR, uploads, storage policies, audit trails, secrets, RBAC, tenant isolation, and privacy.' },

  tester:        { id: 'tester',        name: 'The Tester',         emoji: '🔬', role: 'QA & Test Strategy',              layer: 'Assurance',  color: '#f472b6', bg: '#500724',
    quick: ['Create RLS test suite', 'Write Playwright flows', 'Audit enrollment edge cases', 'Build release checklist'],
    persona: 'You are The Tester. You produce unit, integration, e2e, security, accessibility, and performance tests. You think in edge cases, regressions, and release gates.' },

  devops:        { id: 'devops',        name: 'DevOps Officer',     emoji: '🚀', role: 'CI/CD, Environments & Releases',  layer: 'Operations', color: '#22d3ee', bg: '#164e63',
    quick: ['Design GitHub Actions pipeline', 'Define environments', 'Create release checklist', 'Plan rollback strategy'],
    persona: 'You are the DevOps Officer. You design branches, environments, GitHub Actions, Vercel deployments, release notes, migrations, rollback plans, and operational runbooks.' },

  administrator: { id: 'administrator', name: 'Administrator',      emoji: '🗂️', role: 'Academic Operations',             layer: 'Operations', color: '#60a5fa', bg: '#172554',
    quick: ['Design course nomenclature', 'Build academic calendar', 'Set capacity rules', 'Define teacher assignment rules'],
    persona: 'You are the Academic Administrator. You govern academic periods, course codes, enrollment windows, capacity, teacher assignments, waitlists, publishing rules, and registrar-style workflows.' },

  custodian:     { id: 'custodian',     name: 'Content Custodian',  emoji: '📋', role: 'Instructional Quality',           layer: 'Learning',   color: '#fb923c', bg: '#431407',
    quick: ['Audit course completeness', 'Create pre-publish checklist', 'Improve module sequence', 'Write rubric standards'],
    persona: 'You are the Content Custodian, guardian of instructional quality. You audit syllabi, outcomes, modules, learning objects, rubrics, completion criteria, naming, and pedagogical flow.' },

  tutor:         { id: 'tutor',         name: 'AI Tutor Designer',  emoji: '🧠', role: 'Adaptive Learning & AI Tutor',    layer: 'Learning',   color: '#c084fc', bg: '#3b0764',
    quick: ['Design AI tutor memory', 'Create adaptive path logic', 'Plan spaced repetition', 'Write tutor guardrails'],
    persona: 'You are the AI Tutor Designer. You design adaptive learning, safe tutoring, retrieval context, learner memory, knowledge graphs, spaced repetition, and teacher-controlled AI boundaries.' },

  data:          { id: 'data',          name: 'Data Scientist',     emoji: '📈', role: 'Analytics & Learning Metrics',    layer: 'Insights',   color: '#a3e635', bg: '#1a2e05',
    quick: ['Define learning KPIs', 'Design analytics schema', 'Create retention model', 'Build teacher dashboard metrics'],
    persona: 'You are the Data Scientist. You define learning analytics, engagement metrics, progress models, grade insights, retention signals, and responsible AI/data practices.' },

  writer:        { id: 'writer',        name: 'Technical Writer',   emoji: '✍️', role: 'Docs, ADRs & Runbooks',          layer: 'Knowledge',  color: '#e5e7eb', bg: '#27272a',
    quick: ['Write README', 'Create ADR template', 'Draft contributor guide', 'Generate release notes'],
    persona: 'You are the Technical Writer. You create clear docs, ADRs, runbooks, onboarding guides, API references, release notes, and project memory summaries.' },

  wildcard:      { id: 'wildcard',      name: 'The Wildcard',       emoji: '🃏', role: 'Innovation & Provocation',        layer: 'Vision',     color: '#d946ef', bg: '#4a044e',
    quick: ['Pitch a never-seen feature', 'Make this viral', 'Gamify the LMS', 'Design future-state experience'],
    persona: 'You are The Wildcard. You reject conventional LMS thinking. Propose bold, feasible ideas inspired by games, social platforms, creative tools, AI, and learning science.' },
} as const
```

**Agent layer grouping for sidebar** (render in this order):
`Executive` → `Build` → `Assurance` → `Operations` → `Learning` → `Insights` → `Knowledge` → `Vision`

**Per-agent color theming:** Use `data-agent={agent.id}` on containers and drive `color` and `bg` via inline styles or CSS custom properties. Each agent's `color` applies to: card border tint, name text, active button border, chat header gradient left-stop, history highlight. Each agent's `bg` is the left stop of a `linear-gradient(90deg, bg, #101014)` header gradient.

---

## 6. Embedded Docs

The `docs` view renders static markdown from this array. Do not omit any entry.

```typescript
const DOCS = [
  { id: 'vision',       icon: '🎯', title: 'Vision',
    body: `# LMS Project HQ Vision\n\nBuild more than an LMS. Build an AI-assisted software architecture operating system for creating, governing, documenting, and shipping a learning platform.\n\n## North Star\nA fast, secure, ministry-ready and academic-ready LMS that makes learning simpler for students, course management easier for teachers, and governance clearer for administrators.\n\n## Product Principles\n- Edge-first user experience\n- RLS-first security\n- AI-assisted but human-governed workflows\n- Institutional memory by default\n- Documentation generated as part of the work\n- Every feature ships with acceptance criteria, tests, and operational ownership\n\n## Platform Modules\n- AI Council\n- Project Brain\n- Documents\n- ADRs\n- Decision Register\n- Risk Register\n- Task Engine\n- GitHub Governance\n- Release Management\n- Course Content QA\n- Analytics\n- AI Tutor Design` },

  { id: 'architecture', icon: '🏛️', title: 'Architecture',
    body: `# Architecture\n\n\`\`\`\nBrowser / Mobile\n   ↓\nNext.js App Router on Vercel\n   ↓\nServer Components, Route Handlers, Middleware\n   ↓\nSupabase\n   ├─ Auth\n   ├─ Postgres + RLS\n   ├─ Storage Policies\n   ├─ Realtime\n   └─ Edge Functions\n\`\`\`\n\n## Domain Boundaries\n- Identity: profiles, roles, memberships\n- Academic: terms, courses, sections, enrollments\n- Learning: modules, learning objects, progress\n- Assessment: assignments, submissions, rubrics, grades\n- Communication: announcements, notifications, discussions\n- AI: tutor sessions, retrieval sources, learner memory\n- Governance: ADRs, decisions, risks, tasks, releases\n\n## Core Rule\nThe database decides authorization. The UI only improves experience.` },

  { id: 'schema',       icon: '🗄️', title: 'Schema Blueprint',
    body: `# Schema Blueprint\n\nSee supabase/migrations/ for the live schema.\n\n## Core Tables\n- profiles — identity + role + XP\n- courses — course catalog with status + level gating\n- course_blocks — canvas block model (flat, float sort_order)\n- block_types — registry of 15 block types\n- course_enrollments — role + status + source state machine\n- block_submissions — graded attempts\n- organizations — multi-tenancy\n- hq_sessions — council decision log\n- hq_tasks — governance task engine\n- hq_risks — risk register\n- hq_decisions — decision log / ADRs\n\n## Key Invariants\n- RLS on every table\n- course_blocks uses float sort_order for O(1) reorder\n- XP escalation via DB trigger (Level = 1 + floor(sqrt(xp/100)))\n- block_submissions tied to enrollment, not just user` },

  { id: 'rls',          icon: '🛡️', title: 'Security + RLS',
    body: `# Security + RLS Standard\n\n## Non-Negotiables\n- Enable RLS on every table.\n- No broad service-role usage in the frontend.\n- Storage buckets require explicit policies.\n- Every policy gets tests.\n- Every tenant boundary gets abuse-case tests.\n\n## Policy Pattern\n\`\`\`sql\nalter table courses enable row level security;\n\ncreate policy "published courses visible to authenticated users"\non courses for select\nto authenticated\nusing (status = 'published');\n\ncreate policy "teachers manage own courses"\non courses for all\nto authenticated\nusing (owner_id = auth.uid())\nwith check (owner_id = auth.uid());\n\`\`\`\n\n## Security Review Gates\n- Auth flow reviewed\n- RLS policies tested\n- Upload limits enforced\n- PII inventory completed\n- Audit trail enabled for sensitive actions` },

  { id: 'workflow',     icon: '⚙️', title: 'Workflow Engine',
    body: `# Workflow Engine\n\n## Feature Intake\n1. Product defines user story.\n2. Architect writes topology impact.\n3. Engineer writes schema/API spec.\n4. Security writes threat model.\n5. Tester writes acceptance tests.\n6. Implementer builds.\n7. DevOps releases.\n8. Writer updates docs.\n\n## Default Statuses\nBacklog → Ready → In Progress → Review → Blocked → Done\n\n## Definition of Done\n- User story accepted\n- RLS checked\n- Tests pass\n- Docs updated\n- Release notes written\n- Operational owner assigned` },

  { id: 'github',       icon: '🔀', title: 'GitHub Governance',
    body: `# GitHub Governance\n\n## Branches\n- main: production\n- develop: staging\n- feature/*: feature work\n- fix/*: bug fixes\n- docs/*: documentation\n\n## PR Template\n- What changed?\n- Why?\n- Screenshots\n- RLS impact\n- Migration impact\n- Tests run\n- Docs updated\n- Rollback plan\n\n## AI Reviewers\n- Architect: boundaries and ADR alignment\n- Engineer: implementation correctness\n- Security: RLS/JWT/storage/privacy\n- Tester: coverage and edge cases\n- Writer: docs and clarity` },

  { id: 'roadmap',      icon: '🗺️', title: 'Roadmap',
    body: `# Roadmap\n\n## Phase 0 — Project HQ\n- AI council\n- Docs\n- Decisions\n- Risks\n- Tasks\n- ADRs\n\n## Phase 1 — LMS MVP\n- Auth\n- Courses\n- Modules / Blocks\n- Learning objects\n- Enrollment\n- Progress\n- Assignments\n- Basic gradebook\n\n## Phase 2 — Academic Operations\n- Terms\n- Sections\n- Teacher assignment\n- Waitlists\n- Announcements\n- Certificates\n\n## Phase 3 — Intelligence\n- AI tutor\n- Learning analytics\n- Adaptive paths\n- Knowledge graph\n- Early warning signals` },
]
```

---

## Acceptance Criteria

The implementation is complete when ALL of the following are true:

- [ ] All 4 tables exist in Supabase with RLS enabled and seed data present
- [ ] `/api/ai` proxies to Anthropic, streams SSE, uses Edge runtime
- [ ] `dashboard` view shows correct live counts + clickable agent cards that navigate to `agents` view
- [ ] `agents` view: selecting an agent loads its prior sessions as a chat thread
- [ ] `agents` view: submitting input streams a response token-by-token in the UI
- [ ] `agents` view: completed response is persisted to `hq_sessions`
- [ ] `agents` view: quick-prompt chips populate the input field on click
- [ ] `agents` view: "Council Review" sends prompt to all 13 agents in parallel and concatenates responses
- [ ] `docs` view: all 7 embedded docs are selectable and render markdown
- [ ] `history` view: all sessions shown, filterable by agent, click expands full prompt + response
- [ ] `tasks` view: add-task input creates a row; status change persists via Supabase update; priority shown as color badge
- [ ] `decisions` view: list renders with status badge, impact badge, and created_at
- [ ] `risks` view: list renders with risk score (severity × probability); "→ Task" button creates a task with `source: 'risk'` and navigates to tasks view
- [ ] All state survives page reload (loaded from Supabase on mount, not in-memory only)
- [ ] Route is staff-only: only users with role `admin` or `manager` can reach `/hq`
- [ ] Per-agent color theming applied: each agent has distinct border, name, and header gradient colors
