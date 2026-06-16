'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

// ─── Types ───────────────────────────────────────────────────────────────────

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
  severity: number
  probability: number
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
  sessionId?: string
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PROJECT_CONTEXT = `
Project: ChurchCore LMS / LMS Project HQ
Target Stack: Next.js App Router, TypeScript, Supabase, Postgres RLS, Storage, Realtime, Edge Functions, Vercel.
Core Pattern: AI council + institutional memory + docs + tasks + ADRs + risk register + GitHub-ready governance.
Security Standard: RLS is source of truth. Never trust client-side checks. Every user-visible data path must have policy tests.
Product Goal: Fast, simple, ministry/academic-ready LMS with course creation, modules, assignments, gradebook, certificates, analytics, and AI tutor support.
`

const cx = (...classes: (string | boolean | undefined | null)[]) => classes.filter(Boolean).join(' ')

const AGENTS: Record<string, any> = {
  architect:     { id: 'architect',     name: 'The Architect',      emoji: '🏛️', role: 'System Design & Architecture',      layer: 'Executive',  color: '#818cf8', bg: '#1e1b4b', quick: ['Design the full system topology', 'Decide multi-tenancy model', 'Write an ADR for learning objects', 'Map all integration boundaries'], persona: `You are The Architect, a senior technical architect designing a serverless, AI-native LMS on Vercel + Supabase. You think in systems, boundaries, trade-offs, failure modes, and long-term maintainability. Produce ADRs, topology diagrams, domain maps, and migration paths.` },
  product:       { id: 'product',       name: 'Product Manager',    emoji: '🧭', role: 'Roadmap, Scope & Prioritization',   layer: 'Executive',  color: '#38bdf8', bg: '#082f49', quick: ['Prioritize MVP scope', 'Create user stories for gradebook', 'Define release milestones', 'Write acceptance criteria'], persona: `You are the Product Manager. You convert vision into epics, milestones, acceptance criteria, and release sequencing. You protect the MVP from bloat while preserving the larger platform vision.` },
  engineer:      { id: 'engineer',      name: 'The Engineer',       emoji: '⚙️', role: 'Schemas, APIs & Specs',             layer: 'Build',      color: '#34d399', bg: '#022c22', quick: ['Write core database schema SQL', 'Design all RLS policies', 'Spec API routes', 'Define TypeScript interfaces'], persona: `You are The Engineer, a pragmatic senior engineer. Produce concrete SQL, API contracts, TypeScript types, Supabase policies, edge function designs, and implementation checklists. No hand-waving.` },
  implementer:   { id: 'implementer',   name: 'The Implementer',    emoji: '💻', role: 'Code & Deployment',                 layer: 'Build',      color: '#fbbf24', bg: '#451a03', quick: ['Build ModuleItemRenderer', 'Write auth middleware', 'Create course page', 'Implement enrollment function'], persona: `You are The Implementer, a full-stack developer writing production-ready Next.js, Supabase, SQL, and Vercel code. Include file paths, strict TypeScript, validation, and error handling.` },
  security:      { id: 'security',      name: 'Security Officer',   emoji: '🛡️', role: 'RLS, Privacy & Threat Models',     layer: 'Assurance',  color: '#fb7185', bg: '#4c0519', quick: ['Threat model the LMS', 'Audit RLS policies', 'Design privacy controls', 'List OWASP risks'], persona: `You are the Security Officer. You threat-model everything: RLS, JWT, IDOR, uploads, storage policies, audit trails, secrets, RBAC, tenant isolation, FERPA/GDPR/COPPA-style privacy, and abuse cases.` },
  tester:        { id: 'tester',        name: 'The Tester',         emoji: '🔬', role: 'QA & Test Strategy',               layer: 'Assurance',  color: '#f472b6', bg: '#500724', quick: ['Create RLS test suite', 'Write Playwright flows', 'Audit enrollment edge cases', 'Build release checklist'], persona: `You are The Tester. You produce unit, integration, e2e, security, accessibility, and performance tests. You think in edge cases, regressions, and release gates.` },
  devops:        { id: 'devops',        name: 'DevOps Officer',     emoji: '🚀', role: 'CI/CD, Environments & Releases',   layer: 'Operations', color: '#22d3ee', bg: '#164e63', quick: ['Design GitHub Actions pipeline', 'Define environments', 'Create release checklist', 'Plan rollback strategy'], persona: `You are the DevOps Officer. You design branches, environments, GitHub Actions, Vercel deployments, release notes, migrations, rollback plans, build logs, and operational runbooks.` },
  administrator: { id: 'administrator', name: 'Administrator',      emoji: '🗂️', role: 'Academic Operations',              layer: 'Operations', color: '#60a5fa', bg: '#172554', quick: ['Design course nomenclature', 'Build academic calendar', 'Set capacity rules', 'Define teacher assignment rules'], persona: `You are the Academic Administrator. You govern academic periods, course codes, enrollment windows, capacity, teacher assignments, waitlists, publishing rules, and registrar-style workflows.` },
  custodian:     { id: 'custodian',     name: 'Content Custodian',  emoji: '📋', role: 'Instructional Quality',            layer: 'Learning',   color: '#fb923c', bg: '#431407', quick: ['Audit course completeness', 'Create pre-publish checklist', 'Improve module sequence', 'Write rubric standards'], persona: `You are the Content Custodian, guardian of instructional quality. You audit syllabi, outcomes, modules, learning objects, rubrics, completion criteria, naming, and pedagogical flow.` },
  tutor:         { id: 'tutor',         name: 'AI Tutor Designer',  emoji: '🧠', role: 'Adaptive Learning & AI Tutor',     layer: 'Learning',   color: '#c084fc', bg: '#3b0764', quick: ['Design AI tutor memory', 'Create adaptive path logic', 'Plan spaced repetition', 'Write tutor guardrails'], persona: `You are the AI Tutor Designer. You design adaptive learning, safe tutoring, retrieval context, learner memory, knowledge graphs, spaced repetition, and teacher-controlled AI boundaries.` },
  data:          { id: 'data',          name: 'Data Scientist',     emoji: '📈', role: 'Analytics & Learning Metrics',     layer: 'Insights',   color: '#a3e635', bg: '#1a2e05', quick: ['Define learning KPIs', 'Design analytics schema', 'Create retention model', 'Build teacher dashboard metrics'], persona: `You are the Data Scientist. You define learning analytics, engagement metrics, progress models, grade insights, retention signals, and responsible AI/data practices.` },
  writer:        { id: 'writer',        name: 'Technical Writer',   emoji: '✍️', role: 'Docs, ADRs & Runbooks',           layer: 'Knowledge',  color: '#e5e7eb', bg: '#27272a', quick: ['Write README', 'Create ADR template', 'Draft contributor guide', 'Generate release notes'], persona: `You are the Technical Writer. You create clear docs, ADRs, runbooks, onboarding guides, API references, release notes, and project memory summaries.` },
  wildcard:      { id: 'wildcard',      name: 'The Wildcard',       emoji: '🃏', role: 'Innovation & Provocation',         layer: 'Vision',     color: '#d946ef', bg: '#4a044e', quick: ['Pitch a never-seen feature', 'Make this viral', 'Gamify the LMS', 'Design future-state experience'], persona: `You are The Wildcard. You reject conventional LMS thinking. Propose bold, weird, feasible ideas inspired by games, social platforms, creative tools, AI, and learning science.` },
}

const DOCS = [
  { id: 'vision',       icon: '🎯', title: 'Vision',            body: `# LMS Project HQ Vision\n\nBuild more than an LMS. Build an AI-assisted software architecture operating system for creating, governing, documenting, and shipping a learning platform.\n\n## North Star\nA fast, secure, ministry-ready and academic-ready LMS that makes learning simpler for students, course management easier for teachers, and governance clearer for administrators.\n\n## Product Principles\n- Edge-first user experience\n- RLS-first security\n- AI-assisted but human-governed workflows\n- Institutional memory by default\n- Documentation generated as part of the work\n- Every feature ships with acceptance criteria, tests, and operational ownership\n\n## Platform Modules\n- AI Council\n- Project Brain\n- Documents\n- ADRs\n- Decision Register\n- Risk Register\n- Task Engine\n- GitHub Governance\n- Release Management\n- Course Content QA\n- Analytics\n- AI Tutor Design` },
  { id: 'architecture', icon: '🏛️', title: 'Architecture',      body: `# Architecture\n\n\`\`\`\nBrowser / Mobile\n   ↓\nNext.js App Router on Vercel\n   ↓\nServer Components, Route Handlers, Middleware\n   ↓\nSupabase\n   ├─ Auth\n   ├─ Postgres + RLS\n   ├─ Storage Policies\n   ├─ Realtime\n   └─ Edge Functions\n\`\`\`\n\n## Domain Boundaries\n- Identity: profiles, roles, memberships\n- Academic: terms, courses, sections, enrollments\n- Learning: modules, learning objects, progress\n- Assessment: assignments, submissions, rubrics, grades\n- Communication: announcements, notifications, discussions\n- AI: tutor sessions, retrieval sources, learner memory\n- Governance: ADRs, decisions, risks, tasks, releases\n\n## Core Rule\nThe database decides authorization. The UI only improves experience.` },
  { id: 'schema',       icon: '🗄️', title: 'Schema Blueprint',  body: `# Schema Blueprint\n\nSee supabase/migrations/ for the live schema.\n\n## Core Tables\n- profiles — identity + role + XP\n- courses — course catalog with status + level gating\n- course_blocks — canvas block model (flat, float sort_order)\n- block_types — registry of 15 block types\n- course_enrollments — role + status + source state machine\n- block_submissions — graded attempts\n- organizations — multi-tenancy\n- hq_sessions — council decision log\n- hq_tasks — governance task engine\n- hq_risks — risk register\n- hq_decisions — decision log / ADRs\n\n## Key Invariants\n- RLS on every table\n- course_blocks uses float sort_order for O(1) reorder\n- XP escalation via DB trigger (Level = 1 + floor(sqrt(xp/100)))\n- block_submissions tied to enrollment, not just user` },
  { id: 'rls',          icon: '🛡️', title: 'Security + RLS',   body: `# Security + RLS Standard\n\n## Non-Negotiables\n- Enable RLS on every table.\n- No broad service-role usage in the frontend.\n- Storage buckets require explicit policies.\n- Every policy gets tests.\n- Every tenant boundary gets abuse-case tests.\n\n## Policy Pattern\n\`\`\`sql\nalter table courses enable row level security;\n\ncreate policy "published courses visible to authenticated users"\non courses for select\nto authenticated\nusing (status = 'published');\n\ncreate policy "teachers manage own courses"\non courses for all\nto authenticated\nusing (owner_id = auth.uid())\nwith check (owner_id = auth.uid());\n\`\`\`\n\n## Security Review Gates\n- Auth flow reviewed\n- RLS policies tested\n- Upload limits enforced\n- PII inventory completed\n- Audit trail enabled for sensitive actions` },
  { id: 'workflow',     icon: '⚙️', title: 'Workflow Engine',   body: `# Workflow Engine\n\n## Feature Intake\n1. Product defines user story.\n2. Architect writes topology impact.\n3. Engineer writes schema/API spec.\n4. Security writes threat model.\n5. Tester writes acceptance tests.\n6. Implementer builds.\n7. DevOps releases.\n8. Writer updates docs.\n\n## Default Statuses\nBacklog → Ready → In Progress → Review → Blocked → Done\n\n## Definition of Done\n- User story accepted\n- RLS checked\n- Tests pass\n- Docs updated\n- Release notes written\n- Operational owner assigned` },
  { id: 'github',       icon: '🔀', title: 'GitHub Governance', body: `# GitHub Governance\n\n## Branches\n- main: production\n- develop: staging\n- feature/*: feature work\n- fix/*: bug fixes\n- docs/*: documentation\n\n## PR Template\n- What changed?\n- Why?\n- Screenshots\n- RLS impact\n- Migration impact\n- Tests run\n- Docs updated\n- Rollback plan\n\n## AI Reviewers\n- Architect: boundaries and ADR alignment\n- Engineer: implementation correctness\n- Security: RLS/JWT/storage/privacy\n- Tester: coverage and edge cases\n- Writer: docs and clarity` },
  { id: 'roadmap',      icon: '🗺️', title: 'Roadmap',           body: `# Roadmap\n\n## Phase 0 — Project HQ\n- AI council\n- Docs\n- Decisions\n- Risks\n- Tasks\n- ADRs\n\n## Phase 1 — LMS MVP\n- Auth\n- Courses\n- Modules / Blocks\n- Learning objects\n- Enrollment\n- Progress\n- Assignments\n- Basic gradebook\n\n## Phase 2 — Academic Operations\n- Terms\n- Sections\n- Teacher assignment\n- Waitlists\n- Announcements\n- Certificates\n\n## Phase 3 — Intelligence\n- AI tutor\n- Learning analytics\n- Adaptive paths\n- Knowledge graph\n- Early warning signals` },
]

const CONSENSUS_PROMPT = `Run a council review for the proposed feature. Return:\n1. Executive summary\n2. Recommendation\n3. Architecture impact\n4. Data model impact\n5. Security/RLS risks\n6. QA acceptance criteria\n7. UX concerns\n8. Implementation phases\n9. Decision record draft`

const TASK_STATUSES = ['backlog', 'ready', 'in_progress', 'review', 'blocked', 'done'] as const
const PRIORITIES    = ['P0', 'P1', 'P2', 'P3'] as const

// Pre-generated static CSS for per-agent theming
const AGENT_CSS = Object.values(AGENTS).map(a => (
  `[data-agent="${a.id}"].agentCard{border-color:${a.color}33}` +
  `[data-agent="${a.id}"] .agentCardName{color:${a.color}}` +
  `[data-agent="${a.id}"].agentButton.selected{border-color:${a.color}}` +
  `[data-agent="${a.id}"].agentHeader{background:linear-gradient(90deg,${a.bg},#101014)}` +
  `[data-agent="${a.id}"] .agentTitle{color:${a.color}}` +
  `[data-agent="${a.id}"].historyDetailHead{background:linear-gradient(90deg,${a.bg},#101014)}` +
  `[data-agent="${a.id}"] .historyDetailName{color:${a.color}}` +
  `[data-agent="${a.id}"] .historyItemAgent{color:${a.color}}`
)).join('')

// ─── Sub-components ───────────────────────────────────────────────────────────

type StatVariant = 'indigo' | 'sky' | 'lime' | 'amber'
function Stat({ label, value, variant = 'indigo' }: { label: string; value: number; variant?: StatVariant }) {
  return (
    <div className={`stat stat-${variant}`}>
      <div className="statValue">{value}</div>
      <div className="statLabel">{label}</div>
    </div>
  )
}

type PillVariant = 'indigo' | 'green' | 'pink' | 'rose' | 'amber'
function Pill({ children, variant = 'indigo' }: { children: React.ReactNode; variant?: PillVariant }) {
  return <span className={`pill pill-${variant}`}>{children}</span>
}

function CopyButton({ text, id, copied, onCopy }: { text: string; id: string; copied: string | null; onCopy: (text: string, id: string) => void }) {
  const done = copied === id
  return (
    <button type="button" onClick={() => onCopy(text, id)} className={`copyBtn ${done ? 'copied' : ''}`} title="Copy to clipboard">
      {done ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function HQPage() {
  const supabase = useMemo(() => createClient(), [])

  const [view, setView]               = useState('dashboard')
  const [activeAgent, setActiveAgent] = useState('architect')
  const [activeDoc, setActiveDoc]     = useState('vision')
  const [messages, setMessages]       = useState<Record<string, ChatMessage[]>>({})
  const [sessions, setSessions]       = useState<HqSession[]>([])
  const [tasks, setTasks]             = useState<HqTask[]>([])
  const [risks, setRisks]             = useState<HqRisk[]>([])
  const [decisions, setDecisions]     = useState<HqDecision[]>([])
  const [selectedSession, setSelectedSession] = useState<HqSession | null>(null)
  const [historyFilter, setHistoryFilter]     = useState<string>('all')
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [feature, setFeature]         = useState('AI-assisted gradebook with teacher override and student progress explanations')
  const [copied, setCopied]           = useState<string | null>(null)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [savingRiskId, setSavingRiskId] = useState<string | null>(null)

  const authUidRef   = useRef<string | null>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const streamingRef = useRef('')

  const agent           = AGENTS[activeAgent]
  const currentMessages = messages[activeAgent] || []
  const doc             = DOCS.find((d) => d.id === activeDoc) || DOCS[0]

  const groupedAgents = useMemo(() =>
    Object.values(AGENTS).reduce<Record<string, any[]>>((acc, a) => {
      acc[a.layer] ||= []; acc[a.layer].push(a); return acc
    }, {}),
  [])

  const filteredSessions = useMemo(() =>
    historyFilter === 'all' ? sessions : sessions.filter(s => s.agent_id === historyFilter),
  [sessions, historyFilter])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, activeAgent, loading])

  // Load auth uid
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      authUidRef.current = user?.id ?? null
    })
  }, [supabase])

  // Load sessions and reconstruct chat threads
  useEffect(() => {
    supabase
      .from('hq_sessions')
      .select('*')
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        setSessions(data as HqSession[])
        const grouped: Record<string, ChatMessage[]> = {}
        for (const s of data as HqSession[]) {
          grouped[s.agent_id] ||= []
          grouped[s.agent_id].push(
            { role: 'user',      content: s.prompt,   ts: s.created_at, sessionId: s.id },
            { role: 'assistant', content: s.response, ts: s.created_at, sessionId: s.id },
          )
        }
        setMessages(grouped)
      })
  }, [supabase])

  // Load tasks
  useEffect(() => {
    supabase.from('hq_tasks').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setTasks(data as HqTask[]) })
  }, [supabase])

  // Load risks
  useEffect(() => {
    supabase.from('hq_risks').select('*').order('severity', { ascending: false })
      .then(({ data }) => { if (data) setRisks(data as HqRisk[]) })
  }, [supabase])

  // Load decisions
  useEffect(() => {
    supabase.from('hq_decisions').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setDecisions(data as HqDecision[]) })
  }, [supabase])

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text)
      .then(() => { setCopied(id); setTimeout(() => setCopied(null), 2000) })
      .catch(() => {
        const el = document.createElement('textarea')
        el.value = text; document.body.appendChild(el); el.select()
        document.execCommand('copy'); document.body.removeChild(el)
        setCopied(id); setTimeout(() => setCopied(null), 2000)
      })
  }

  async function dbAddTask(title: string, owner: string | null = null, priority: HqTask['priority'] = 'P2', source: HqTask['source'] = 'manual') {
    const { data, error } = await supabase
      .from('hq_tasks')
      .insert({ title, owner, priority, status: 'backlog', source })
      .select().single()
    if (!error && data) setTasks(prev => [data as HqTask, ...prev])
    return { data, error }
  }

  async function dbUpdateTaskStatus(id: string, status: HqTask['status']) {
    const { error } = await supabase
      .from('hq_tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (!error) setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t))
  }

  async function dbDeleteTask(id: string) {
    const { error } = await supabase.from('hq_tasks').delete().eq('id', id)
    if (!error) setTasks(prev => prev.filter(t => t.id !== id))
  }

  async function convertRiskToTask(risk: HqRisk) {
    setSavingRiskId(risk.id)
    await dbAddTask(`Mitigate: ${risk.title}`, risk.owner, 'P1', 'risk')
    setSavingRiskId(null)
    setView('tasks')
  }

  async function sendMessage(text = input) {
    if (!text.trim() || loading) return
    const promptText = text.trim()
    const history = [...currentMessages, { role: 'user' as const, content: promptText, ts: new Date().toISOString() }]

    setMessages((prev) => ({
      ...prev,
      [activeAgent]: [
        ...(prev[activeAgent] || []),
        { role: 'user',      content: promptText, ts: new Date().toISOString() },
        { role: 'assistant', content: '',          ts: new Date().toISOString() },
      ],
    }))
    setInput('')
    setLoading(true)
    streamingRef.current = ''

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          stream: true,
          system: `${agent.persona}\n\n${PROJECT_CONTEXT}\nRespond as ${agent.name}. Be specific, structured, actionable, and implementation-aware.`,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      })

      if (!res.ok || !res.body) throw new Error(`API ${res.status}`)

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      const patch = (content: string) =>
        setMessages((prev) => {
          const thread = [...(prev[activeAgent] || [])]
          const last = thread[thread.length - 1]
          if (last?.role === 'assistant') thread[thread.length - 1] = { ...last, content }
          return { ...prev, [activeAgent]: thread }
        })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue
          try {
            const event = JSON.parse(raw)
            if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
              streamingRef.current += event.delta.text
              patch(streamingRef.current)
            }
          } catch { /* skip malformed SSE */ }
        }
      }

      const reply = streamingRef.current || 'No response received.'

      // Persist to DB — user_id auto-fills via DEFAULT auth.uid() but we pass it explicitly too
      const { data: saved, error } = await supabase
        .from('hq_sessions')
        .insert({
          user_id:    authUidRef.current,
          agent_id:   activeAgent,
          agent_name: agent.name,
          prompt:     promptText,
          response:   reply,
        })
        .select().single()

      if (!error && saved) {
        const session = saved as HqSession
        setSessions((prev) => [...prev, session])
        setMessages((prev) => {
          const thread = [...(prev[activeAgent] || [])]
          const last = thread[thread.length - 1]
          if (last?.role === 'assistant') thread[thread.length - 1] = { ...last, sessionId: session.id }
          return { ...prev, [activeAgent]: thread }
        })
      }
    } catch {
      setMessages((prev) => {
        const thread = [...(prev[activeAgent] || [])]
        const last = thread[thread.length - 1]
        if (last?.role === 'assistant' && last.content === '') {
          thread[thread.length - 1] = { ...last, content: '⚠️ API connection failed. Check that ANTHROPIC_API_KEY is set in .env.local and /api/ai is reachable.' }
        }
        return { ...prev, [activeAgent]: thread }
      })
    } finally {
      setLoading(false)
    }
  }

  async function runCouncilReview() {
    setActiveAgent('product')
    setView('agents')
    sendMessage(`${CONSENSUS_PROMPT}\n\nFeature: ${feature}`)

    // Persist decision and task to DB
    const [{ data: dec }, { data: task }] = await Promise.all([
      supabase.from('hq_decisions')
        .insert({ title: `Council review: ${feature}`, owner: 'Product Manager', status: 'Proposed', impact: 'High' })
        .select().single(),
      supabase.from('hq_tasks')
        .insert({ title: `Break down: ${feature}`, owner: 'Product Manager', priority: 'P1', status: 'backlog', source: 'council' })
        .select().single(),
    ])
    if (dec)  setDecisions(prev => [dec  as HqDecision, ...prev])
    if (task) setTasks(prev     => [task as HqTask,     ...prev])
  }

  const nav = [
    ['dashboard', '◈', 'HQ'],
    ['agents',    '⚡', 'Agents'],
    ['docs',      '📄', 'Docs'],
    ['history',   '🕒', 'History'],
    ['tasks',     '✅', 'Tasks'],
    ['decisions', '🧠', 'Memory'],
    ['risks',     '⚠️', 'Risks'],
    ['release',   '🚢', 'Release'],
  ]

  return (
    <div className="app">
      {/* ── Rail ─────────────────────────────────────────────────────── */}
      <aside className="rail">
        <div className="brand">LMS<span>.HQ</span></div>
        {nav.map(([id, icon, label]) => (
          <button key={id} type="button" className={cx('nav', view === id && 'active')} onClick={() => setView(id as string)}>
            <span>{icon}</span>{label}
          </button>
        ))}
        <div className="railFooter">
          <Pill variant="green">Vercel</Pill>
          <Pill variant="green">Supabase</Pill>
          <Pill variant="pink">RLS-first</Pill>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="main">
        <header className="topbar">
          <div>
            <h1>{view === 'dashboard' ? 'AI Project Headquarters' : nav.find((n) => n[0] === view)?.[2]}</h1>
            <p>ChurchCore LMS · agent council · governance memory · release discipline</p>
          </div>
          <div className="topActions">
            <input value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="Propose a feature…" title="Feature to review" />
            <button type="button" onClick={runCouncilReview}>Run Council Review</button>
          </div>
        </header>

        {/* ── Dashboard ──────────────────────────────────────────────── */}
        {view === 'dashboard' && (
          <section className="grid dashboard">
            <div className="panel hero">
              <h2>From idea to governed implementation.</h2>
              <p>AI-assisted operating system: agents, documentation, risk, decisions, tasks, releases, and implementation discipline in one place.</p>
              <div className="stats">
                <Stat label="Specialist Agents" value={Object.keys(AGENTS).length} />
                <Stat label="Docs"               value={DOCS.length}                       variant="sky" />
                <Stat label="Council Sessions"   value={sessions.length}                   variant="lime" />
                <Stat label="Active Tasks"       value={tasks.filter(t => t.status !== 'done').length} variant="amber" />
              </div>
            </div>
            <div className="panel">
              <h3>Operating Model</h3>
              {['Feature intake creates a council review.', 'Council review creates decisions and tasks.', 'Tasks map to agents and release gates.', 'Docs and ADRs become institutional memory.', 'Security and tests are required before release.'].map((x, i) =>
                <div key={x} className="timeline"><b>{i + 1}</b><span>{x}</span></div>
              )}
            </div>
            <div className="panel wide">
              <h3>Agent Council</h3>
              <div className="agentGrid">
                {Object.values(AGENTS).map((a) => (
                  <button type="button" key={a.id} data-agent={a.id} className="agentCard" onClick={() => { setActiveAgent(a.id); setView('agents') }}>
                    <span>{a.emoji}</span><b className="agentCardName">{a.name}</b><small>{a.role}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── Agents ─────────────────────────────────────────────────── */}
        {view === 'agents' && (
          <section className="workspace">
            <aside className="agentList">
              {Object.entries(groupedAgents).map(([layer, list]) => (
                <div key={layer}>
                  <h4>{layer}</h4>
                  {list.map((a) => (
                    <button type="button" key={a.id} data-agent={a.id} className={cx('agentButton', activeAgent === a.id && 'selected')} onClick={() => setActiveAgent(a.id)}>
                      <span>{a.emoji}</span>
                      <div>
                        <b>{a.name}</b>
                        <small>{(messages[a.id] || []).filter(m => m.role === 'assistant').length} responses</small>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </aside>
            <div className="chat">
              <div className="agentHeader" data-agent={activeAgent}>
                <span>{agent.emoji}</span>
                <div><h2 className="agentTitle">{agent.name}</h2><p>{agent.role}</p></div>
                {currentMessages.length > 0 && (
                  <button
                    type="button"
                    className="clearChat"
                    onClick={() => setMessages((prev) => ({ ...prev, [activeAgent]: [] }))}
                    title="Clear chat history for this agent"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="quickRow">
                {agent.quick.map((q: string) => (
                  <button type="button" key={q} onClick={() => sendMessage(q)}>{q}</button>
                ))}
              </div>
              <div className="messages">
                {currentMessages.length === 0 && (
                  <div className="empty">Ask {agent.name} to produce a blueprint, code, checklist, risk review, ADR, or implementation plan.</div>
                )}
                {currentMessages.map((m, i) => {
                  const copyId = m.sessionId ? `msg-${m.sessionId}` : `msg-${activeAgent}-${i}`
                  return (
                    <div key={i} className={cx('message', m.role)}>
                      {m.ts && <div className="msgMeta">{fmt(m.ts)}</div>}
                      <pre>{m.content}</pre>
                      {m.role === 'assistant' && (
                        <CopyButton text={m.content} id={copyId} copied={copied} onCopy={copyText} />
                      )}
                    </div>
                  )
                })}
                {loading && currentMessages[currentMessages.length - 1]?.content === '' && (
                  <div className="message assistant">
                    <pre className="thinking">Connecting to {agent.name}…</pre>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
              <div className="composer">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={`Ask ${agent.name}… (Enter to send, Shift+Enter for newline)`}
                  title="Message input"
                />
                <button type="button" disabled={loading || !input.trim()} onClick={() => sendMessage()}>Send</button>
              </div>
            </div>
          </section>
        )}

        {/* ── Docs ───────────────────────────────────────────────────── */}
        {view === 'docs' && (
          <section className="workspace">
            <aside className="docList">
              {DOCS.map((d) => (
                <button type="button" key={d.id} className={cx(activeDoc === d.id && 'selected')} onClick={() => setActiveDoc(d.id)}>
                  {d.icon} {d.title}
                </button>
              ))}
            </aside>
            <article className="doc">
              <div className="docToolbar">
                <CopyButton text={doc.body} id={`doc-${doc.id}`} copied={copied} onCopy={copyText} />
              </div>
              <pre>{doc.body}</pre>
            </article>
          </section>
        )}

        {/* ── History ────────────────────────────────────────────────── */}
        {view === 'history' && (
          <section className="workspace">
            <aside className="historyList">
              <div className="historyFilter">
                <select
                  value={historyFilter}
                  onChange={(e) => { setHistoryFilter(e.target.value); setSelectedSession(null) }}
                  title="Filter by agent"
                >
                  <option value="all">All agents ({sessions.length})</option>
                  {Object.values(AGENTS).map((a) => {
                    const count = sessions.filter(s => s.agent_id === a.id).length
                    return count > 0
                      ? <option key={a.id} value={a.id}>{a.emoji} {a.name} ({count})</option>
                      : null
                  })}
                </select>
              </div>
              {filteredSessions.length === 0
                ? <div className="historyEmpty">No sessions yet. Run a council review or ask an agent something.</div>
                : [...filteredSessions].reverse().map((s) => {
                    const a = AGENTS[s.agent_id]
                    return (
                      <button
                        type="button" key={s.id} data-agent={s.agent_id}
                        className={cx('historyItem', selectedSession?.id === s.id && 'selected')}
                        onClick={() => setSelectedSession(s)}
                      >
                        <div className="historyItemHead">
                          <span className="historyItemAgent">{a?.emoji} {a?.name ?? s.agent_name}</span>
                          <time>{fmt(s.created_at)}</time>
                        </div>
                        <p className="historyPrompt">{s.prompt.slice(0, 90)}{s.prompt.length > 90 ? '…' : ''}</p>
                      </button>
                    )
                  })
              }
            </aside>
            <div className="historyDetail">
              {selectedSession ? (
                <>
                  <div className="historyDetailHead" data-agent={selectedSession.agent_id}>
                    <span className="historyDetailEmoji">{AGENTS[selectedSession.agent_id]?.emoji}</span>
                    <div>
                      <b className="historyDetailName">{selectedSession.agent_name}</b>
                      <small>{fmt(selectedSession.created_at)}</small>
                    </div>
                    <button type="button" className="openInAgent"
                      onClick={() => { setActiveAgent(selectedSession.agent_id); setView('agents') }}>
                      Open in Agent →
                    </button>
                  </div>
                  <div className="historyContent">
                    <div className="historySection">
                      <div className="historySectionHead">
                        <span className="historySectionLabel">Prompt</span>
                        <CopyButton text={selectedSession.prompt} id={`h-prompt-${selectedSession.id}`} copied={copied} onCopy={copyText} />
                      </div>
                      <pre className="historyPre user">{selectedSession.prompt}</pre>
                    </div>
                    <div className="historySection">
                      <div className="historySectionHead">
                        <span className="historySectionLabel">Response</span>
                        <CopyButton text={selectedSession.response} id={`h-resp-${selectedSession.id}`} copied={copied} onCopy={copyText} />
                      </div>
                      <pre className="historyPre">{selectedSession.response}</pre>
                    </div>
                  </div>
                </>
              ) : (
                <div className="historyPlaceholder">
                  <p>Select a session from the list to view the full prompt and response.</p>
                  <p className="muted">{sessions.length} total sessions across {new Set(sessions.map(s => s.agent_id)).size} agents.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Tasks ──────────────────────────────────────────────────── */}
        {view === 'tasks' && (
          <section className="panel full taskSection">
            <div className="sectionHead">
              <h2>Task Engine <span className="taskCount">{tasks.filter(t => t.status !== 'done').length} active</span></h2>
              <div className="addTaskRow">
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newTaskTitle.trim()) {
                      dbAddTask(newTaskTitle.trim(), agent.name, 'P2', 'manual')
                      setNewTaskTitle('')
                    }
                  }}
                  placeholder="New task title… (Enter to add)"
                  className="taskInput"
                />
                <button type="button" onClick={() => {
                  if (newTaskTitle.trim()) {
                    dbAddTask(newTaskTitle.trim(), agent.name, 'P2', 'manual')
                    setNewTaskTitle('')
                  }
                }}>Add Task</button>
              </div>
            </div>
            <div className="kanban">
              {TASK_STATUSES.map((status) => (
                <div className="lane" key={status}>
                  <h3>{status.replace('_', ' ')} <span className="laneCount">{tasks.filter(t => t.status === status).length}</span></h3>
                  {tasks.filter((t) => t.status === status).map((t) => (
                    <div className="task" key={t.id}>
                      <b>{t.title}</b>
                      <small>{t.owner ?? '—'}</small>
                      <div className="taskMeta">
                        <Pill variant={t.priority === 'P0' ? 'rose' : t.priority === 'P1' ? 'amber' : 'indigo'}>
                          {t.priority}
                        </Pill>
                        {t.source !== 'manual' && (
                          <Pill variant={t.source === 'risk' ? 'pink' : 'green'}>{t.source}</Pill>
                        )}
                      </div>
                      <div className="taskActions">
                        <select
                          value={t.status}
                          onChange={(e) => dbUpdateTaskStatus(t.id, e.target.value as HqTask['status'])}
                          title="Change status"
                          className="taskStatusSelect"
                        >
                          {TASK_STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                        </select>
                        <button type="button" className="taskDelete" onClick={() => dbDeleteTask(t.id)} title="Delete task">×</button>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Memory / Decisions ─────────────────────────────────────── */}
        {view === 'decisions' && (
          <section className="panel full">
            <h2>Project Brain: Decisions <span className="taskCount">{decisions.length}</span></h2>
            <p className="muted">Every major architectural, product, and operational choice. Council session full text is in History.</p>
            {decisions.length === 0
              ? <p className="muted emptyMsg">No decisions recorded yet. Run a Council Review to create one.</p>
              : decisions.map((d) => (
                <div key={d.id} className="row">
                  <div>
                    <b>{d.title}</b>
                    <small className="rowSub">{fmt(d.created_at)}</small>
                  </div>
                  <span>{d.owner}</span>
                  <Pill>{d.status}</Pill>
                  <Pill variant="amber">{d.impact}</Pill>
                </div>
              ))
            }
          </section>
        )}

        {/* ── Risks ──────────────────────────────────────────────────── */}
        {view === 'risks' && (
          <section className="panel full">
            <h2>Risk Register <span className="taskCount">{risks.length} risks</span></h2>
            <p className="muted">Click "→ Task" to convert a risk into a mitigation task in the Task Engine.</p>
            {risks.length === 0
              ? <p className="muted emptyMsg">No risks recorded yet.</p>
              : risks.map((r) => (
                <div key={r.id} className="risk">
                  <div>
                    <b>{r.title}</b>
                    <p>{r.mitigation}</p>
                  </div>
                  <span className="riskScore">S{r.severity}/P{r.probability}</span>
                  <small>{r.owner}</small>
                  <button
                    type="button"
                    className={cx('riskToTask', savingRiskId === r.id && 'saving')}
                    disabled={savingRiskId === r.id}
                    onClick={() => convertRiskToTask(r)}
                    title="Convert to mitigation task"
                  >
                    {savingRiskId === r.id ? '…' : '→ Task'}
                  </button>
                </div>
              ))
            }
          </section>
        )}

        {/* ── Release ────────────────────────────────────────────────── */}
        {view === 'release' && (
          <section className="grid dashboard">
            <div className="panel wide">
              <h2>Release Readiness</h2>
              <div className="checklist">
                {['Schema migration reviewed', 'RLS policies tested', 'Playwright happy path passes', 'Accessibility smoke test completed', 'Docs and ADRs updated', 'Rollback plan documented', 'Teacher/student/admin flows validated'].map((x) => (
                  <label key={x}><input type="checkbox" /> {x}</label>
                ))}
              </div>
            </div>
            <div className="panel">
              <h3>Environment Matrix</h3>
              <div className="row"><b>local</b><Pill>developer</Pill></div>
              <div className="row"><b>preview</b><Pill>PR</Pill></div>
              <div className="row"><b>staging</b><Pill>develop</Pill></div>
              <div className="row"><b>production</b><Pill>main</Pill></div>
            </div>
          </section>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        *{box-sizing:border-box}body{margin:0}
        .app{height:100vh;background:#09090b;color:#e5e7eb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;display:flex;overflow:hidden}
        .rail{width:220px;background:#0c0c10;border-right:1px solid #24242a;padding:18px 12px;display:flex;flex-direction:column;gap:8px;flex-shrink:0}
        .brand{font-weight:900;letter-spacing:.08em;color:#fff;margin:0 0 16px 8px}.brand span{color:#818cf8}
        .nav{border:1px solid transparent;background:transparent;color:#9ca3af;padding:10px 12px;border-radius:10px;text-align:left;cursor:pointer;font-weight:700;display:flex;gap:10px;font-size:13px}
        .nav:hover,.nav.active{background:#18181f;color:#fff;border-color:#373744}
        .railFooter{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap}
        .main{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}
        .topbar{height:86px;border-bottom:1px solid #24242a;background:#0f0f14;display:flex;align-items:center;gap:20px;padding:16px 24px;flex-shrink:0}
        .topbar h1{font-size:20px;margin:0}.topbar p{margin:4px 0 0;color:#71717a;font-size:12px}
        .topActions{margin-left:auto;display:flex;gap:10px}
        .topActions input{width:430px;max-width:42vw;background:#18181f;border:1px solid #30303a;color:#e5e7eb;border-radius:10px;padding:10px 12px}
        .topActions button,.sectionHead button,.composer button{background:#6366f1;color:white;border:0;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer}
        .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:18px;overflow:auto}
        .panel{background:#111116;border:1px solid #262631;border-radius:18px;padding:20px;box-shadow:0 10px 35px #0005}
        .panel.full{margin:18px;overflow:auto;flex:1}.panel.wide{grid-column:span 2}
        .taskSection{display:flex;flex-direction:column}
        .hero{grid-column:span 2;background:radial-gradient(circle at top left,#312e81,#111116 45%)}
        .hero h2{font-size:34px;margin:0 0 10px}.hero p,.muted{color:#a1a1aa;line-height:1.6}
        .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}
        .stat{background:#0b0b0f;border:1px solid;border-radius:14px;padding:14px}
        .stat-indigo{border-color:#818cf833}.stat-indigo .statValue{color:#818cf8}
        .stat-sky{border-color:#38bdf833}.stat-sky .statValue{color:#38bdf8}
        .stat-lime{border-color:#a3e63533}.stat-lime .statValue{color:#a3e635}
        .stat-amber{border-color:#fbbf2433}.stat-amber .statValue{color:#fbbf24}
        .statValue{font-size:28px;font-weight:900}.statLabel{color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
        .timeline{display:flex;gap:12px;align-items:flex-start;margin:14px 0;color:#cbd5e1}
        .timeline b{background:#18181f;color:#818cf8;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;flex-shrink:0}
        .agentGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
        .agentCard{background:#0b0b0f;border:1px solid transparent;border-radius:14px;padding:14px;text-align:left;color:#e5e7eb;cursor:pointer}
        .agentCard span{font-size:22px;display:block}.agentCardName{display:block;margin-top:8px}
        .agentCard small,.agentButton small{display:block;color:#71717a;margin-top:3px}
        .workspace{display:flex;flex:1;overflow:hidden;min-height:0}
        .agentList,.docList{width:260px;background:#0f0f14;border-right:1px solid #24242a;padding:14px;overflow-y:auto;flex-shrink:0}
        .agentList h4{font-size:10px;color:#52525b;text-transform:uppercase;letter-spacing:.12em;margin:14px 6px 6px}
        .agentButton,.docList button{width:100%;background:transparent;border:1px solid transparent;color:#d4d4d8;padding:10px;border-radius:12px;text-align:left;cursor:pointer;display:flex;gap:10px}
        .agentButton.selected,.docList button.selected{background:#18181f}
        .chat{flex:1;display:flex;flex-direction:column;min-width:0;overflow:hidden}
        .agentHeader{padding:18px 22px;border-bottom:1px solid #262631;display:flex;gap:14px;align-items:center;flex-shrink:0;background:#101014}
        .agentHeader span{font-size:36px}.agentTitle{margin:0;color:#818cf8}.agentHeader p{margin:2px 0 0;color:#9ca3af}
        .quickRow{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid #202028;flex-wrap:wrap;flex-shrink:0}
        .quickRow button{background:#17171d;color:#cbd5e1;border:1px solid #30303a;border-radius:999px;padding:7px 10px;cursor:pointer;font-size:12px}
        .messages{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:4px}
        .empty{color:#52525b;text-align:center;padding:70px}
        .message{margin-bottom:14px}.message.assistant{max-width:100%}.message.user{margin-left:auto;max-width:72%}
        .msgMeta{font-size:10px;color:#3f3f50;margin-bottom:4px;text-align:right}.message.user .msgMeta{text-align:right}.message.assistant .msgMeta{text-align:left}
        .message pre,.doc pre,.historyPre{white-space:pre-wrap;word-break:break-word;font-family:JetBrains Mono,Menlo,monospace;font-size:12.5px;line-height:1.8;margin:0}
        .message pre{background:#15151b;border:1px solid #282833;border-radius:14px;padding:18px}
        .message.user pre{background:#1e1b4b;border-color:#3730a3}
        .thinking{color:#52525b;animation:pulse 1.5s infinite}@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
        .copyBtn{display:inline-flex;align-items:center;gap:4px;margin-top:6px;font-size:11px;font-weight:700;color:#6366f1;background:transparent;border:1px solid #30303a;border-radius:6px;cursor:pointer;padding:4px 10px;transition:all .15s}
        .copyBtn:hover{background:#18181f;border-color:#6366f1}.copyBtn.copied{color:#34d399;border-color:#34d399}
        .composer{display:flex;gap:10px;padding:14px;border-top:1px solid #24242a;background:#0f0f14;flex-shrink:0}
        .composer textarea{flex:1;resize:none;min-height:58px;background:#18181f;border:1px solid #30303a;color:#fff;border-radius:12px;padding:12px;font:inherit}
        .composer button:disabled{opacity:.45;cursor:not-allowed}
        .doc{flex:1;overflow:auto;padding:30px;max-width:980px}
        .docToolbar{display:flex;justify-content:flex-end;margin-bottom:12px}
        .historyList{width:320px;background:#0f0f14;border-right:1px solid #24242a;display:flex;flex-direction:column;flex-shrink:0;overflow:hidden}
        .historyFilter{padding:12px;border-bottom:1px solid #24242a;flex-shrink:0}
        .historyFilter select{width:100%;background:#18181f;border:1px solid #30303a;color:#e5e7eb;border-radius:8px;padding:8px 10px;font:inherit;cursor:pointer}
        .historyEmpty{padding:24px;color:#52525b;text-align:center;font-size:13px}
        .historyItem{width:100%;background:transparent;border:none;border-bottom:1px solid #1a1a22;padding:12px 14px;text-align:left;cursor:pointer;color:#d4d4d8;transition:background .1s}
        .historyItem:hover{background:#13131a}.historyItem.selected{background:#18181f}
        .historyItemHead{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:4px;font-size:12px;font-weight:700}
        .historyItemHead time{font-size:10px;color:#52525b;font-weight:400;flex-shrink:0}
        .historyPrompt{margin:0;font-size:11px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.4}
        .historyDetail{flex:1;display:flex;flex-direction:column;overflow:hidden}
        .historyDetailHead{padding:16px 20px;border-bottom:1px solid #262631;display:flex;gap:14px;align-items:center;flex-shrink:0;background:#111}
        .historyDetailEmoji{font-size:28px}.historyDetailName{display:block;font-size:15px;color:#fff}.historyDetailHead small{color:#9ca3af;font-size:11px}
        .historyItemAgent{font-weight:700;color:#818cf8}
        .openInAgent{margin-left:auto;background:transparent;border:1px solid #30303a;color:#818cf8;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700}
        .openInAgent:hover{background:#18181f}
        .clearChat{margin-left:auto;background:transparent;border:1px solid #30303a;color:#52525b;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700;transition:all .15s}
        .clearChat:hover{border-color:#fb7185;color:#fb7185}
        .historyContent{flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:20px}
        .historySection{display:flex;flex-direction:column;gap:8px}
        .historySectionHead{display:flex;align-items:center;justify-content:space-between}
        .historySectionLabel{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#52525b}
        .historyPre{background:#15151b;border:1px solid #282833;border-radius:12px;padding:16px}
        .historyPre.user{background:#1a1840;border-color:#2e2a66}
        .historyPlaceholder{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#52525b;text-align:center;gap:8px;padding:40px}
        .taskCount{font-size:13px;font-weight:400;color:#52525b;margin-left:8px}
        .laneCount{font-size:10px;font-weight:400;color:#52525b}
        .addTaskRow{display:flex;gap:8px;align-items:center}
        .taskInput{flex:1;background:#18181f;border:1px solid #30303a;color:#e5e7eb;border-radius:10px;padding:10px 12px;font:inherit;min-width:280px}
        .kanban{display:grid;grid-template-columns:repeat(6,minmax(160px,1fr));gap:12px;overflow-x:auto;flex:1;padding-bottom:8px}
        .lane{background:#0c0c10;border:1px solid #24242a;border-radius:14px;padding:12px;min-height:420px}
        .lane h3{text-transform:uppercase;letter-spacing:.08em;color:#71717a;font-size:11px;margin-top:0}
        .task{background:#17171d;border:1px solid #292934;border-radius:12px;padding:12px;margin:10px 0}
        .task small{display:block;color:#8b8b94;margin:5px 0;font-size:11px}
        .taskMeta{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}
        .taskActions{display:flex;gap:6px;align-items:center;margin-top:8px}
        .taskStatusSelect{flex:1;background:#0f0f14;border:1px solid #30303a;color:#a1a1aa;border-radius:6px;padding:4px 6px;font-size:11px;cursor:pointer}
        .taskDelete{background:transparent;border:1px solid #30303a;color:#52525b;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .taskDelete:hover{border-color:#fb7185;color:#fb7185}
        .pill{font-size:10px;border:1px solid;border-radius:999px;padding:3px 7px;display:inline-block;background:#0003;font-weight:800}
        .pill-indigo{border-color:#818cf855;color:#818cf8}
        .pill-green{border-color:#34d39955;color:#34d399}
        .pill-pink{border-color:#f472b655;color:#f472b6}
        .pill-rose{border-color:#fb718555;color:#fb7185}
        .pill-amber{border-color:#fbbf2455;color:#fbbf24}
        .sectionHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px}
        .row{display:flex;align-items:flex-start;gap:12px;border-bottom:1px solid #24242a;padding:14px 0}
        .row b{flex:1}.row span{color:#a1a1aa;flex-shrink:0}
        .rowSub{display:block;color:#52525b;font-size:11px;margin-top:2px;font-weight:400}
        .risk{display:grid;grid-template-columns:1fr 80px 160px 80px;gap:14px;align-items:center;border:1px solid #292934;background:#101016;border-radius:14px;padding:14px;margin:10px 0}
        .risk p{margin:6px 0 0;color:#a1a1aa;font-size:12px}.riskScore{color:#fb7185;font-weight:900;font-size:14px}.risk small{color:#71717a;font-size:12px}
        .riskToTask{background:#18181f;border:1px solid #34d39966;color:#34d399;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px;font-weight:700;transition:all .15s}
        .riskToTask:hover{background:#022c22;border-color:#34d399}.riskToTask.saving{opacity:.5;cursor:not-allowed}
        .emptyMsg{margin-top:24px}
        .checklist{display:grid;gap:12px;margin-top:18px}
        .checklist label{background:#0d0d12;border:1px solid #262631;border-radius:12px;padding:13px;color:#d4d4d8}
        @media(max-width:1000px){
          .rail{width:80px}.brand span,.nav>*:last-child{display:none}.nav{justify-content:center}
          .topbar{height:auto;align-items:flex-start;flex-direction:column}
          .topActions{margin-left:0;width:100%}.topActions input{max-width:none;width:100%}
          .grid{grid-template-columns:1fr}.hero,.panel.wide{grid-column:auto}
          .agentGrid,.stats{grid-template-columns:1fr 1fr}
          .agentList,.docList,.historyList{width:200px}
          .kanban{grid-template-columns:repeat(2,280px)}
          .risk{grid-template-columns:1fr 60px}
        }
        ${AGENT_CSS}
      ` }} />
    </div>
  )
}
