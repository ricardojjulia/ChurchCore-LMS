# Engineering Rules

## Code Quality
- TypeScript strict mode. No `any` unless genuinely unavoidable and documented.
- Prefer server components. Only add `"use client"` when browser APIs or hooks are required.
- No inline styles except inside the HQ page's existing `<style>` block.
- Named exports for components, default exports for page files (Next.js convention).
- Tailwind for all styling. No CSS modules, no styled-components.

## Patterns
- Supabase server client via `@/utils/supabase/server` in server components and route handlers.
- Supabase browser client via `@/utils/supabase/client` only inside `"use client"` components.
- Never call Anthropic API directly from the client. Always route through `/api/ai`.
- Use `Promise.all` for concurrent Supabase fetches in server components.
- Handle all Supabase errors explicitly — never silently swallow them in production paths.

## File Conventions
- Pages: `src/app/<route>/page.tsx`
- API routes: `src/app/api/<name>/route.ts`
- Shared components: `src/components/<domain>/<Component>.tsx`
- Utilities: `src/utils/<domain>/<file>.ts`
- Supabase migrations: `supabase/migrations/<NNN>_<description>.sql`

## Commits
- One logical change per commit.
- Commit message: imperative mood, under 72 chars.
- Never commit `.env.local` or any file containing secrets.
- Open a PR; do not push directly to `main`.
