# Architecture Rules

## Constitutional Axioms (non-negotiable)
1. **Compute-Persistence Separation** — frontend is stateless. No server-side state outside Supabase.
2. **Database-Enforced Security** — RLS is the authorization boundary. Middleware and UI are UX, not security.
3. **Polymorphic Extensibility** — learning content lives as JSONB nodes in `modules.items`. No separate tables per content type.
4. **Sub-Millisecond Response Targets** — use Vercel Edge SSR and aggressive CDN caching for public pages.
5. **Event-Driven Asynchrony** — heavy work (grading aggregation, certificates, notifications) goes to Supabase Edge Functions triggered by DB events.
6. **Anti-Exploitation Gamification** — XP and badge awards are computed server-side only, never from client triggers.

## Domain Boundaries
- **Identity**: `profiles`, roles, memberships
- **Academic**: courses, enrollments, terms (future)
- **Learning**: `modules`, JSONB learning objects, progress tracking
- **Assessment**: `submissions`, rubrics (JSONB), grade aggregation
- **AI**: tutor sessions, retrieval, learner memory (Phase 3)
- **Governance**: HQ — decisions, risks, tasks, ADRs (in-app, not DB)

## Integration Boundaries
- Vercel ↔ Supabase: REST + Realtime WebSocket only. No direct DB connections from edge functions unless via Supabase client.
- LMS ↔ AI: all LLM calls go through `/api/ai` edge route. Never expose `ANTHROPIC_API_KEY` to the browser.
- Storage: Supabase Storage with explicit bucket policies. No public buckets for user-submitted content.

## What NOT to do
- Do not add application-layer authorization checks as a substitute for RLS.
- Do not create separate tables for `video_nodes`, `assignment_nodes`, etc. — use the JSONB model.
- Do not add server state (sessions, in-memory caches) to Next.js route handlers.
