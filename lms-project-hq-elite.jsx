import { useEffect, useMemo, useRef, useState } from "react";

/**
 * LMS Project HQ Elite
 * A single-file AI-assisted project operating system prototype for planning,
 * governing, documenting, and building a Next.js + Supabase LMS.
 */

const PROJECT_CONTEXT = `
Project: ChurchCore LMS / LMS Project HQ
Target Stack: Next.js App Router, TypeScript, Supabase, Postgres RLS, Storage, Realtime, Edge Functions, Vercel.
Core Pattern: AI council + institutional memory + docs + tasks + ADRs + risk register + GitHub-ready governance.
Security Standard: RLS is source of truth. Never trust client-side checks. Every user-visible data path must have policy tests.
Product Goal: Fast, simple, ministry/academic-ready LMS with course creation, modules, assignments, gradebook, certificates, analytics, and AI tutor support.
`;

const cx = (...classes) => classes.filter(Boolean).join(" ");

const AGENTS = {
  architect: {
    id: "architect",
    name: "The Architect",
    emoji: "🏛️",
    role: "System Design & Architecture",
    layer: "Executive",
    color: "#818cf8",
    bg: "#1e1b4b",
    quick: ["Design the full system topology", "Decide multi-tenancy model", "Write an ADR for learning objects", "Map all integration boundaries"],
    persona: `You are The Architect, a senior technical architect designing a serverless, AI-native LMS on Vercel + Supabase. You think in systems, boundaries, trade-offs, failure modes, and long-term maintainability. Produce ADRs, topology diagrams, domain maps, and migration paths.`,
  },
  product: {
    id: "product",
    name: "Product Manager",
    emoji: "🧭",
    role: "Roadmap, Scope & Prioritization",
    layer: "Executive",
    color: "#38bdf8",
    bg: "#082f49",
    quick: ["Prioritize MVP scope", "Create user stories for gradebook", "Define release milestones", "Write acceptance criteria"],
    persona: `You are the Product Manager. You convert vision into epics, milestones, acceptance criteria, and release sequencing. You protect the MVP from bloat while preserving the larger platform vision.`,
  },
  engineer: {
    id: "engineer",
    name: "The Engineer",
    emoji: "⚙️",
    role: "Schemas, APIs & Specs",
    layer: "Build",
    color: "#34d399",
    bg: "#022c22",
    quick: ["Write core database schema SQL", "Design all RLS policies", "Spec API routes", "Define TypeScript interfaces"],
    persona: `You are The Engineer, a pragmatic senior engineer. Produce concrete SQL, API contracts, TypeScript types, Supabase policies, edge function designs, and implementation checklists. No hand-waving.`,
  },
  implementer: {
    id: "implementer",
    name: "The Implementer",
    emoji: "💻",
    role: "Code & Deployment",
    layer: "Build",
    color: "#fbbf24",
    bg: "#451a03",
    quick: ["Build ModuleItemRenderer", "Write auth middleware", "Create course page", "Implement enrollment function"],
    persona: `You are The Implementer, a full-stack developer writing production-ready Next.js, Supabase, SQL, and Vercel code. Include file paths, strict TypeScript, validation, and error handling.`,
  },
  security: {
    id: "security",
    name: "Security Officer",
    emoji: "🛡️",
    role: "RLS, Privacy & Threat Models",
    layer: "Assurance",
    color: "#fb7185",
    bg: "#4c0519",
    quick: ["Threat model the LMS", "Audit RLS policies", "Design privacy controls", "List OWASP risks"],
    persona: `You are the Security Officer. You threat-model everything: RLS, JWT, IDOR, uploads, storage policies, audit trails, secrets, RBAC, tenant isolation, FERPA/GDPR/COPPA-style privacy, and abuse cases.`,
  },
  tester: {
    id: "tester",
    name: "The Tester",
    emoji: "🔬",
    role: "QA & Test Strategy",
    layer: "Assurance",
    color: "#f472b6",
    bg: "#500724",
    quick: ["Create RLS test suite", "Write Playwright flows", "Audit enrollment edge cases", "Build release checklist"],
    persona: `You are The Tester. You produce unit, integration, e2e, security, accessibility, and performance tests. You think in edge cases, regressions, and release gates.`,
  },
  devops: {
    id: "devops",
    name: "DevOps Officer",
    emoji: "🚀",
    role: "CI/CD, Environments & Releases",
    layer: "Operations",
    color: "#22d3ee",
    bg: "#164e63",
    quick: ["Design GitHub Actions pipeline", "Define environments", "Create release checklist", "Plan rollback strategy"],
    persona: `You are the DevOps Officer. You design branches, environments, GitHub Actions, Vercel deployments, release notes, migrations, rollback plans, build logs, and operational runbooks.`,
  },
  administrator: {
    id: "administrator",
    name: "Administrator",
    emoji: "🗂️",
    role: "Academic Operations",
    layer: "Operations",
    color: "#60a5fa",
    bg: "#172554",
    quick: ["Design course nomenclature", "Build academic calendar", "Set capacity rules", "Define teacher assignment rules"],
    persona: `You are the Academic Administrator. You govern academic periods, course codes, enrollment windows, capacity, teacher assignments, waitlists, publishing rules, and registrar-style workflows.`,
  },
  custodian: {
    id: "custodian",
    name: "Content Custodian",
    emoji: "📋",
    role: "Instructional Quality",
    layer: "Learning",
    color: "#fb923c",
    bg: "#431407",
    quick: ["Audit course completeness", "Create pre-publish checklist", "Improve module sequence", "Write rubric standards"],
    persona: `You are the Content Custodian, guardian of instructional quality. You audit syllabi, outcomes, modules, learning objects, rubrics, completion criteria, naming, and pedagogical flow.`,
  },
  tutor: {
    id: "tutor",
    name: "AI Tutor Designer",
    emoji: "🧠",
    role: "Adaptive Learning & AI Tutor",
    layer: "Learning",
    color: "#c084fc",
    bg: "#3b0764",
    quick: ["Design AI tutor memory", "Create adaptive path logic", "Plan spaced repetition", "Write tutor guardrails"],
    persona: `You are the AI Tutor Designer. You design adaptive learning, safe tutoring, retrieval context, learner memory, knowledge graphs, spaced repetition, and teacher-controlled AI boundaries.`,
  },
  data: {
    id: "data",
    name: "Data Scientist",
    emoji: "📈",
    role: "Analytics & Learning Metrics",
    layer: "Insights",
    color: "#a3e635",
    bg: "#1a2e05",
    quick: ["Define learning KPIs", "Design analytics schema", "Create retention model", "Build teacher dashboard metrics"],
    persona: `You are the Data Scientist. You define learning analytics, engagement metrics, progress models, grade insights, retention signals, and responsible AI/data practices.`,
  },
  writer: {
    id: "writer",
    name: "Technical Writer",
    emoji: "✍️",
    role: "Docs, ADRs & Runbooks",
    layer: "Knowledge",
    color: "#e5e7eb",
    bg: "#27272a",
    quick: ["Write README", "Create ADR template", "Draft contributor guide", "Generate release notes"],
    persona: `You are the Technical Writer. You create clear docs, ADRs, runbooks, onboarding guides, API references, release notes, and project memory summaries.`,
  },
  wildcard: {
    id: "wildcard",
    name: "The Wildcard",
    emoji: "🃏",
    role: "Innovation & Provocation",
    layer: "Vision",
    color: "#d946ef",
    bg: "#4a044e",
    quick: ["Pitch a never-seen feature", "Make this viral", "Gamify the LMS", "Design future-state experience"],
    persona: `You are The Wildcard. You reject conventional LMS thinking. Propose bold, weird, feasible ideas inspired by games, social platforms, creative tools, AI, and learning science.`,
  },
};

const DOCS = [
  {
    id: "vision",
    icon: "🎯",
    title: "Vision",
    body: `# LMS Project HQ Vision\n\nBuild more than an LMS. Build an AI-assisted software architecture operating system for creating, governing, documenting, and shipping a learning platform.\n\n## North Star\nA fast, secure, ministry-ready and academic-ready LMS that makes learning simpler for students, course management easier for teachers, and governance clearer for administrators.\n\n## Product Principles\n- Edge-first user experience\n- RLS-first security\n- AI-assisted but human-governed workflows\n- Institutional memory by default\n- Documentation generated as part of the work\n- Every feature ships with acceptance criteria, tests, and operational ownership\n\n## Platform Modules\n- AI Council\n- Project Brain\n- Documents\n- ADRs\n- Decision Register\n- Risk Register\n- Task Engine\n- GitHub Governance\n- Release Management\n- Course Content QA\n- Analytics\n- AI Tutor Design`,
  },
  {
    id: "architecture",
    icon: "🏛️",
    title: "Architecture",
    body: `# Architecture\n\n\`\`\`\nBrowser / Mobile\n   ↓\nNext.js App Router on Vercel\n   ↓\nServer Components, Route Handlers, Middleware\n   ↓\nSupabase\n   ├─ Auth\n   ├─ Postgres + RLS\n   ├─ Storage Policies\n   ├─ Realtime\n   └─ Edge Functions\n\`\`\`\n\n## Domain Boundaries\n- Identity: profiles, roles, memberships\n- Academic: terms, courses, sections, enrollments\n- Learning: modules, learning objects, progress\n- Assessment: assignments, submissions, rubrics, grades\n- Communication: announcements, notifications, discussions\n- AI: tutor sessions, retrieval sources, learner memory\n- Governance: ADRs, decisions, risks, tasks, releases\n\n## Core Rule\nThe database decides authorization. The UI only improves experience.`,
  },
  {
    id: "schema",
    icon: "🗄️",
    title: "Schema Blueprint",
    body: `# Schema Blueprint\n\n\`\`\`sql\ncreate type app_role as enum ('student','teacher','admin','super_admin');\ncreate type learning_object_type as enum ('video_stream','resource_file','assignment_link','quiz','discussion','page');\ncreate type task_status as enum ('backlog','ready','in_progress','review','blocked','done');\n\ncreate table profiles (\n  id uuid primary key references auth.users(id) on delete cascade,\n  role app_role not null default 'student',\n  full_name text not null,\n  avatar_url text,\n  created_at timestamptz not null default now()\n);\n\ncreate table courses (\n  id uuid primary key default gen_random_uuid(),\n  code text unique not null,\n  title text not null,\n  description text,\n  teacher_id uuid not null references profiles(id),\n  published boolean not null default false,\n  created_at timestamptz not null default now()\n);\n\ncreate table modules (\n  id uuid primary key default gen_random_uuid(),\n  course_id uuid not null references courses(id) on delete cascade,\n  title text not null,\n  position int not null,\n  estimated_minutes int not null default 60,\n  unique(course_id, position)\n);\n\ncreate table learning_objects (\n  id uuid primary key default gen_random_uuid(),\n  module_id uuid not null references modules(id) on delete cascade,\n  type learning_object_type not null,\n  title text not null,\n  description text,\n  content jsonb not null default '{}',\n  requirements jsonb not null default '{}',\n  position int not null,\n  unique(module_id, position)\n);\n\ncreate table project_decisions (\n  id uuid primary key default gen_random_uuid(),\n  title text not null,\n  problem text not null,\n  decision text not null,\n  rationale text not null,\n  owner_agent text not null,\n  status text not null default 'proposed',\n  created_at timestamptz not null default now()\n);\n\ncreate table project_risks (\n  id uuid primary key default gen_random_uuid(),\n  title text not null,\n  severity int not null check (severity between 1 and 5),\n  probability int not null check (probability between 1 and 5),\n  mitigation text not null,\n  owner_agent text not null,\n  status text not null default 'open'\n);\n\`\`\``,
  },
  {
    id: "rls",
    icon: "🛡️",
    title: "Security + RLS",
    body: `# Security + RLS Standard\n\n## Non-Negotiables\n- Enable RLS on every table.\n- No broad service-role usage in the frontend.\n- Storage buckets require explicit policies.\n- Every policy gets tests.\n- Every tenant boundary gets abuse-case tests.\n\n## Policy Pattern\n\`\`\`sql\nalter table courses enable row level security;\n\ncreate policy "published courses visible to authenticated users"\non courses for select\nto authenticated\nusing (published = true);\n\ncreate policy "teachers manage own courses"\non courses for all\nto authenticated\nusing (teacher_id = auth.uid())\nwith check (teacher_id = auth.uid());\n\`\`\`\n\n## Security Review Gates\n- Auth flow reviewed\n- RLS policies tested\n- Upload limits enforced\n- PII inventory completed\n- Audit trail enabled for sensitive actions`,
  },
  {
    id: "workflow",
    icon: "⚙️",
    title: "Workflow Engine",
    body: `# Workflow Engine\n\n## Feature Intake\n1. Product defines user story.\n2. Architect writes topology impact.\n3. Engineer writes schema/API spec.\n4. Security writes threat model.\n5. Tester writes acceptance tests.\n6. Implementer builds.\n7. DevOps releases.\n8. Writer updates docs.\n\n## Default Statuses\nBacklog → Ready → In Progress → Review → Blocked → Done\n\n## Definition of Done\n- User story accepted\n- RLS checked\n- Tests pass\n- Docs updated\n- Release notes written\n- Operational owner assigned`,
  },
  {
    id: "github",
    icon: "🔀",
    title: "GitHub Governance",
    body: `# GitHub Governance\n\n## Branches\n- main: production\n- develop: staging\n- feature/*: feature work\n- fix/*: bug fixes\n- docs/*: documentation\n\n## PR Template\n- What changed?\n- Why?\n- Screenshots\n- RLS impact\n- Migration impact\n- Tests run\n- Docs updated\n- Rollback plan\n\n## AI Reviewers\n- Architect: boundaries and ADR alignment\n- Engineer: implementation correctness\n- Security: RLS/JWT/storage/privacy\n- Tester: coverage and edge cases\n- Writer: docs and clarity`,
  },
  {
    id: "roadmap",
    icon: "🗺️",
    title: "Roadmap",
    body: `# Roadmap\n\n## Phase 0 — Project HQ\n- AI council\n- Docs\n- Decisions\n- Risks\n- Tasks\n- ADRs\n\n## Phase 1 — LMS MVP\n- Auth\n- Courses\n- Modules\n- Learning objects\n- Enrollment\n- Progress\n- Assignments\n- Basic gradebook\n\n## Phase 2 — Academic Operations\n- Terms\n- Sections\n- Teacher assignment\n- Waitlists\n- Announcements\n- Certificates\n\n## Phase 3 — Intelligence\n- AI tutor\n- Learning analytics\n- Adaptive paths\n- Knowledge graph\n- Early warning signals`,
  },
];

const INITIAL_DECISIONS = [
  { title: "Use Supabase RLS as authorization source of truth", owner: "Security Officer", status: "Accepted", impact: "Critical" },
  { title: "Model lessons as polymorphic JSONB learning objects", owner: "The Architect", status: "Proposed", impact: "High" },
  { title: "Separate Project HQ governance from LMS runtime tables", owner: "The Engineer", status: "Accepted", impact: "Medium" },
];

const INITIAL_RISKS = [
  { title: "RLS policy gaps may expose student records", severity: 5, probability: 3, owner: "Security Officer", mitigation: "Policy tests for every student/teacher/admin path." },
  { title: "Feature bloat could delay MVP", severity: 4, probability: 4, owner: "Product Manager", mitigation: "Phase-gate roadmap and MVP acceptance criteria." },
  { title: "AI tutor may provide unsupervised incorrect guidance", severity: 4, probability: 3, owner: "AI Tutor Designer", mitigation: "Teacher-owned sources, retrieval citations, safe refusal patterns." },
];

const INITIAL_TASKS = [
  { id: 1, title: "Create profiles/courses/modules schema", status: "ready", owner: "The Engineer", priority: "P0" },
  { id: 2, title: "Write RLS tests for enrollments", status: "backlog", owner: "The Tester", priority: "P0" },
  { id: 3, title: "Draft ADR-001: Learning Object Model", status: "in_progress", owner: "The Architect", priority: "P1" },
  { id: 4, title: "Build ModuleItemRenderer prototype", status: "ready", owner: "The Implementer", priority: "P0" },
  { id: 5, title: "Define course naming convention", status: "done", owner: "Administrator", priority: "P2" },
];

const CONSENSUS_PROMPT = `Run a council review for the proposed feature. Return:\n1. Executive summary\n2. Recommendation\n3. Architecture impact\n4. Data model impact\n5. Security/RLS risks\n6. QA acceptance criteria\n7. UX concerns\n8. Implementation phases\n9. Decision record draft`;

function Stat({ label, value, tone = "#818cf8" }) {
  return (
    <div className="stat" style={{ borderColor: `${tone}33` }}>
      <div className="statValue" style={{ color: tone }}>{value}</div>
      <div className="statLabel">{label}</div>
    </div>
  );
}

function Pill({ children, color = "#818cf8" }) {
  return <span className="pill" style={{ borderColor: `${color}55`, color }}>{children}</span>;
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [activeAgent, setActiveAgent] = useState("architect");
  const [activeDoc, setActiveDoc] = useState("vision");
  const [messages, setMessages] = useState({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [decisions, setDecisions] = useState(INITIAL_DECISIONS);
  const [risks, setRisks] = useState(INITIAL_RISKS);
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [feature, setFeature] = useState("AI-assisted gradebook with teacher override and student progress explanations");
  const bottomRef = useRef(null);

  const agent = AGENTS[activeAgent];
  const currentMessages = messages[activeAgent] || [];
  const doc = DOCS.find((d) => d.id === activeDoc) || DOCS[0];

  const groupedAgents = useMemo(() => {
    return Object.values(AGENTS).reduce((acc, a) => {
      acc[a.layer] ||= [];
      acc[a.layer].push(a);
      return acc;
    }, {});
  }, []);

  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, activeAgent, loading]);

  async function sendMessage(text = input) {
    if (!text.trim() || loading) return;
    const userMessage = { role: "user", content: text.trim(), ts: new Date().toISOString() };
    const history = [...currentMessages, userMessage];
    setMessages((prev) => ({ ...prev, [activeAgent]: history }));
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1400,
          system: `${agent.persona}\n\n${PROJECT_CONTEXT}\nRespond as ${agent.name}. Be specific, structured, actionable, and implementation-aware.`,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "No response received.";
      setMessages((prev) => ({ ...prev, [activeAgent]: [...(prev[activeAgent] || []), { role: "assistant", content: reply, ts: new Date().toISOString() }] }));
    } catch (error) {
      const localReply = `⚠️ API connection failed. Local fallback from ${agent.name}:\n\nI would handle this by producing a structured deliverable with context, assumptions, risks, implementation steps, tests, and a decision record. Add your API proxy or backend route before using this in production; never expose provider secrets in the browser.`;
      setMessages((prev) => ({ ...prev, [activeAgent]: [...(prev[activeAgent] || []), { role: "assistant", content: localReply, ts: new Date().toISOString() }] }));
    } finally {
      setLoading(false);
    }
  }

  function runCouncilReview() {
    setActiveAgent("product");
    setView("agents");
    sendMessage(`${CONSENSUS_PROMPT}\n\nFeature: ${feature}`);
    setDecisions((prev) => [{ title: `Council review requested: ${feature}`, owner: "Product Manager", status: "Proposed", impact: "High" }, ...prev]);
    setTasks((prev) => [{ id: Date.now(), title: `Break down feature: ${feature}`, status: "backlog", owner: "Product Manager", priority: "P1" }, ...prev]);
  }

  function addTask() {
    setTasks((prev) => [{ id: Date.now(), title: feature || "New task", status: "backlog", owner: agent.name, priority: "P2" }, ...prev]);
  }

  const nav = [
    ["dashboard", "◈", "HQ"],
    ["agents", "⚡", "Agents"],
    ["docs", "📄", "Docs"],
    ["tasks", "✅", "Tasks"],
    ["decisions", "🧠", "Memory"],
    ["risks", "⚠️", "Risks"],
    ["release", "🚢", "Release"],
  ];

  return (
    <div className="app">
      <aside className="rail">
        <div className="brand">LMS<span>.HQ</span></div>
        {nav.map(([id, icon, label]) => (
          <button key={id} className={cx("nav", view === id && "active")} onClick={() => setView(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
        <div className="railFooter">
          <Pill color="#34d399">Vercel</Pill>
          <Pill color="#34d399">Supabase</Pill>
          <Pill color="#f472b6">RLS-first</Pill>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{view === "dashboard" ? "AI Project Headquarters" : nav.find((n) => n[0] === view)?.[2]}</h1>
            <p>ChurchCore LMS build system · agent council · governance memory · release discipline</p>
          </div>
          <div className="topActions">
            <input value={feature} onChange={(e) => setFeature(e.target.value)} placeholder="Propose a feature..." />
            <button onClick={runCouncilReview}>Run Council Review</button>
          </div>
        </header>

        {view === "dashboard" && (
          <section className="grid dashboard">
            <div className="panel hero">
              <h2>From idea to governed implementation.</h2>
              <p>This upgraded workspace turns the LMS project into an AI-assisted operating system: agents, documentation, risk, decisions, tasks, releases, and implementation discipline in one place.</p>
              <div className="stats">
                <Stat label="Specialist Agents" value={Object.keys(AGENTS).length} />
                <Stat label="Docs" value={DOCS.length} tone="#38bdf8" />
                <Stat label="Open Risks" value={risks.length} tone="#fb7185" />
                <Stat label="Active Tasks" value={tasks.filter((t) => t.status !== "done").length} tone="#fbbf24" />
              </div>
            </div>
            <div className="panel">
              <h3>Operating Model</h3>
              {[
                "Feature intake creates a council review.",
                "Council review creates decisions and tasks.",
                "Tasks map to agents and release gates.",
                "Docs and ADRs become institutional memory.",
                "Security and tests are required before release.",
              ].map((x, i) => <div key={x} className="timeline"><b>{i + 1}</b><span>{x}</span></div>)}
            </div>
            <div className="panel wide">
              <h3>Agent Council</h3>
              <div className="agentGrid">
                {Object.values(AGENTS).map((a) => (
                  <button key={a.id} className="agentCard" style={{ borderColor: `${a.color}33` }} onClick={() => { setActiveAgent(a.id); setView("agents"); }}>
                    <span>{a.emoji}</span><b style={{ color: a.color }}>{a.name}</b><small>{a.role}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {view === "agents" && (
          <section className="workspace">
            <aside className="agentList">
              {Object.entries(groupedAgents).map(([layer, list]) => (
                <div key={layer}>
                  <h4>{layer}</h4>
                  {list.map((a) => (
                    <button key={a.id} className={cx("agentButton", activeAgent === a.id && "selected")} style={{ borderColor: activeAgent === a.id ? a.color : "transparent" }} onClick={() => setActiveAgent(a.id)}>
                      <span>{a.emoji}</span><div><b>{a.name}</b><small>{a.role}</small></div>
                    </button>
                  ))}
                </div>
              ))}
            </aside>
            <div className="chat">
              <div className="agentHeader" style={{ background: `linear-gradient(90deg, ${agent.bg}, #101014)` }}>
                <span>{agent.emoji}</span><div><h2 style={{ color: agent.color }}>{agent.name}</h2><p>{agent.role}</p></div>
              </div>
              <div className="quickRow">{agent.quick.map((q) => <button key={q} onClick={() => sendMessage(q)}>{q}</button>)}</div>
              <div className="messages">
                {currentMessages.length === 0 && <div className="empty">Ask {agent.name} to produce a blueprint, code, checklist, risk review, ADR, or implementation plan.</div>}
                {currentMessages.map((m, i) => <div key={i} className={cx("message", m.role)}><pre>{m.content}</pre></div>)}
                {loading && <div className="message assistant"><pre>Thinking through the project constraints...</pre></div>}
                <div ref={bottomRef} />
              </div>
              <div className="composer">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} placeholder={`Ask ${agent.name}...`} />
                <button disabled={loading || !input.trim()} onClick={() => sendMessage()}>Send</button>
              </div>
            </div>
          </section>
        )}

        {view === "docs" && (
          <section className="workspace">
            <aside className="docList">{DOCS.map((d) => <button key={d.id} className={cx(activeDoc === d.id && "selected")} onClick={() => setActiveDoc(d.id)}>{d.icon} {d.title}</button>)}</aside>
            <article className="doc"><pre>{doc.body}</pre></article>
          </section>
        )}

        {view === "tasks" && (
          <section className="panel full">
            <div className="sectionHead"><h2>Task Engine</h2><button onClick={addTask}>Add Feature as Task</button></div>
            <div className="kanban">
              {["backlog", "ready", "in_progress", "review", "blocked", "done"].map((status) => (
                <div className="lane" key={status}><h3>{status.replace("_", " ")}</h3>{tasks.filter((t) => t.status === status).map((t) => <div className="task" key={t.id}><b>{t.title}</b><small>{t.owner}</small><Pill color={t.priority === "P0" ? "#fb7185" : "#fbbf24"}>{t.priority}</Pill></div>)}</div>
              ))}
            </div>
          </section>
        )}

        {view === "decisions" && (
          <section className="panel full">
            <h2>Project Brain: Decisions</h2>
            <p className="muted">Every major architectural, product, and operational choice should become a memory object.</p>
            {decisions.map((d, i) => <div key={i} className="row"><b>{d.title}</b><span>{d.owner}</span><Pill>{d.status}</Pill><Pill color="#fbbf24">{d.impact}</Pill></div>)}
          </section>
        )}

        {view === "risks" && (
          <section className="panel full">
            <h2>Risk Register</h2>
            {risks.map((r, i) => <div key={i} className="risk"><div><b>{r.title}</b><p>{r.mitigation}</p></div><span>S{r.severity}/P{r.probability}</span><small>{r.owner}</small></div>)}
          </section>
        )}

        {view === "release" && (
          <section className="grid dashboard">
            <div className="panel wide"><h2>Release Readiness</h2><div className="checklist">{["Schema migration reviewed", "RLS policies tested", "Playwright happy path passes", "Accessibility smoke test completed", "Docs and ADRs updated", "Rollback plan documented", "Teacher/student/admin flows validated"].map((x) => <label key={x}><input type="checkbox" /> {x}</label>)}</div></div>
            <div className="panel"><h3>Environment Matrix</h3><div className="row"><b>local</b><Pill>developer</Pill></div><div className="row"><b>preview</b><Pill>PR</Pill></div><div className="row"><b>staging</b><Pill>develop</Pill></div><div className="row"><b>production</b><Pill>main</Pill></div></div>
          </section>
        )}
      </main>

      <style>{`
        *{box-sizing:border-box} body{margin:0}.app{min-height:100vh;background:#09090b;color:#e5e7eb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;display:flex}.rail{width:220px;background:#0c0c10;border-right:1px solid #24242a;padding:18px 12px;display:flex;flex-direction:column;gap:8px}.brand{font-weight:900;letter-spacing:.08em;color:#fff;margin:0 0 16px 8px}.brand span{color:#818cf8}.nav{border:1px solid transparent;background:transparent;color:#9ca3af;padding:10px 12px;border-radius:10px;text-align:left;cursor:pointer;font-weight:700;display:flex;gap:10px}.nav:hover,.nav.active{background:#18181f;color:#fff;border-color:#373744}.railFooter{margin-top:auto;display:flex;gap:6px;flex-wrap:wrap}.main{flex:1;display:flex;flex-direction:column;min-width:0}.topbar{height:86px;border-bottom:1px solid #24242a;background:#0f0f14;display:flex;align-items:center;gap:20px;padding:16px 24px}.topbar h1{font-size:20px;margin:0}.topbar p{margin:4px 0 0;color:#71717a;font-size:12px}.topActions{margin-left:auto;display:flex;gap:10px}.topActions input{width:430px;max-width:42vw;background:#18181f;border:1px solid #30303a;color:#e5e7eb;border-radius:10px;padding:10px 12px}.topActions button,.sectionHead button,.composer button{background:#6366f1;color:white;border:0;border-radius:10px;padding:10px 14px;font-weight:800;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:18px}.panel{background:#111116;border:1px solid #262631;border-radius:18px;padding:20px;box-shadow:0 10px 35px #0005}.panel.full{margin:18px;overflow:auto}.panel.wide{grid-column:span 2}.hero{grid-column:span 2;background:radial-gradient(circle at top left,#312e81,#111116 45%)}.hero h2{font-size:34px;margin:0 0 10px}.hero p,.muted{color:#a1a1aa;line-height:1.6}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.stat{background:#0b0b0f;border:1px solid;border-radius:14px;padding:14px}.statValue{font-size:28px;font-weight:900}.statLabel{color:#71717a;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.timeline{display:flex;gap:12px;align-items:flex-start;margin:14px 0;color:#cbd5e1}.timeline b{background:#18181f;color:#818cf8;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px}.agentGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.agentCard{background:#0b0b0f;border:1px solid;border-radius:14px;padding:14px;text-align:left;color:#e5e7eb;cursor:pointer}.agentCard span{font-size:22px;display:block}.agentCard b{display:block;margin-top:8px}.agentCard small,.agentButton small{display:block;color:#71717a;margin-top:3px}.workspace{display:flex;min-height:0;flex:1;overflow:hidden}.agentList,.docList{width:285px;background:#0f0f14;border-right:1px solid #24242a;padding:14px;overflow:auto}.agentList h4{font-size:10px;color:#52525b;text-transform:uppercase;letter-spacing:.12em;margin:14px 6px 6px}.agentButton,.docList button{width:100%;background:transparent;border:1px solid transparent;color:#d4d4d8;padding:10px;border-radius:12px;text-align:left;cursor:pointer;display:flex;gap:10px}.agentButton.selected,.docList button.selected{background:#18181f}.chat{flex:1;display:flex;flex-direction:column;min-width:0}.agentHeader{padding:18px 22px;border-bottom:1px solid #262631;display:flex;gap:14px;align-items:center}.agentHeader span{font-size:36px}.agentHeader h2{margin:0}.agentHeader p{margin:2px 0 0;color:#9ca3af}.quickRow{display:flex;gap:8px;padding:12px 18px;border-bottom:1px solid #202028;flex-wrap:wrap}.quickRow button{background:#17171d;color:#cbd5e1;border:1px solid #30303a;border-radius:999px;padding:7px 10px;cursor:pointer}.messages{flex:1;overflow:auto;padding:18px}.empty{color:#52525b;text-align:center;padding:70px}.message{max-width:86%;margin:0 0 14px}.message.user{margin-left:auto}.message pre,.doc pre{white-space:pre-wrap;word-break:break-word;font-family:JetBrains Mono,Menlo,monospace;font-size:12px;line-height:1.7;margin:0}.message pre{background:#15151b;border:1px solid #282833;border-radius:14px;padding:14px}.message.user pre{background:#1e1b4b;border-color:#3730a3}.composer{display:flex;gap:10px;padding:14px;border-top:1px solid #24242a;background:#0f0f14}.composer textarea{flex:1;resize:none;min-height:58px;background:#18181f;border:1px solid #30303a;color:#fff;border-radius:12px;padding:12px;font:inherit}.composer button:disabled{opacity:.45;cursor:not-allowed}.doc{flex:1;overflow:auto;padding:30px;max-width:980px}.kanban{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;overflow:auto}.lane{background:#0c0c10;border:1px solid #24242a;border-radius:14px;padding:12px;min-height:420px}.lane h3{text-transform:uppercase;letter-spacing:.08em;color:#71717a;font-size:11px}.task{background:#17171d;border:1px solid #292934;border-radius:12px;padding:12px;margin:10px 0}.task small{display:block;color:#8b8b94;margin:5px 0}.pill{font-size:10px;border:1px solid;border-radius:999px;padding:3px 7px;display:inline-block;background:#0003;font-weight:800}.sectionHead{display:flex;justify-content:space-between;align-items:center}.row{display:flex;align-items:center;gap:12px;border-bottom:1px solid #24242a;padding:14px 0}.row b{flex:1}.row span{color:#a1a1aa}.risk{display:grid;grid-template-columns:1fr 90px 190px;gap:14px;align-items:center;border:1px solid #292934;background:#101016;border-radius:14px;padding:14px;margin:10px 0}.risk p{margin:6px 0 0;color:#a1a1aa}.risk span{color:#fb7185;font-weight:900}.risk small{color:#71717a}.checklist{display:grid;gap:12px;margin-top:18px}.checklist label{background:#0d0d12;border:1px solid #262631;border-radius:12px;padding:13px;color:#d4d4d8}@media(max-width:1000px){.rail{width:88px}.brand span,.nav{font-size:0}.nav span{font-size:18px}.topbar{height:auto;align-items:flex-start;flex-direction:column}.topActions{margin-left:0;width:100%}.topActions input{max-width:none;width:100%}.grid{grid-template-columns:1fr}.hero,.panel.wide{grid-column:auto}.agentGrid,.stats{grid-template-columns:1fr 1fr}.workspace{flex-direction:column}.agentList,.docList{width:auto;max-height:260px}.kanban{grid-template-columns:repeat(2,280px)}}
      `}</style>
    </div>
  );
}
