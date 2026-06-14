# Contributing to ChurchCore LMS

Thank you for contributing. These procedures apply to all contributors — including maintainers — to keep the codebase consistent, reviewable, and secure.

---

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Security Rules](#security-rules-non-negotiable)
3. [Branch Naming](#branch-naming)
4. [Commit Conventions](#commit-conventions)
5. [Pull Request Requirements](#pull-request-requirements)
6. [Code Style](#code-style)
7. [Database & Migrations](#database--migrations)
8. [Testing](#testing)
9. [Changelog](#changelog)

---

## Code of Conduct

This project is built for ministry communities. Contributors are expected to communicate respectfully and constructively in issues, PRs, and reviews.

---

## Security Rules (Non-Negotiable)

These rules are enforced in code review and will block any PR that violates them:

1. **Never expose `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` to the client.** Both must remain server-side only. Never use `NEXT_PUBLIC_` prefixes on these variables.

2. **Never bypass Row Level Security.** Do not use `SET row_security = off`, the service role client on the client side, or any other mechanism that circumvents RLS for user-facing data paths.

3. **Never reference `public.profiles` directly in other tables' RLS policies.** Use `current_user_uid()` and `current_user_role()` SECURITY DEFINER helpers. Direct `profiles` references cause infinite recursion.

4. **Never commit `.env.local` or any file containing secrets.** The `.gitignore` enforces this, but do not create workarounds.

5. **All AI calls must be proxied through `/api/ai`.** Components and server actions must not call Anthropic directly — they call the internal API route which holds the key server-side.

6. **All new tables require RLS enabled and at least one policy.** Tables without RLS will be rejected in review.

---

## Branch Naming

```
<type>/<short-description>
```

| Type | When to use |
|---|---|
| `feat/` | New user-facing feature |
| `fix/` | Bug fix |
| `migration/` | Database-only change |
| `refactor/` | Code restructure with no behavior change |
| `docs/` | Documentation only |
| `chore/` | Tooling, config, dependency updates |

Examples:
```
feat/discussion-threads
fix/quiz-xp-award
migration/029-bulk-enrollment
docs/api-reference
```

**Never commit directly to `main`.** All changes go through PRs.

---

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

```
<type>(<scope>): <short summary>

[optional body]

[optional footer(s)]
```

### Types

| Type | Description |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `migration` | Database migration |
| `refactor` | Refactoring, no behavior change |
| `style` | Formatting, missing semicolons, whitespace |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Dependency updates, config changes |
| `perf` | Performance improvement |
| `security` | Security fix |

### Scope (optional but encouraged)

Use the affected area: `learning`, `dashboard`, `auth`, `gamification`, `messages`, `api`, `migrations`, `ui`, etc.

### Examples

```
feat(learning): add discussion threads to block player
fix(quiz): pass blockXp to submitQuiz action
migration: add get_block_discussion_replies SECURITY DEFINER function
refactor(dashboard): extract InstructorActionPanel
docs: update README with architecture decisions
security: enforce staff-only check in staff_enroll_student
```

### Rules

- Summary line: lowercase, no period, ≤72 characters
- Use the imperative mood: "add feature" not "added feature"
- Reference issues in the footer: `Closes #42`
- Breaking changes: add `BREAKING CHANGE:` footer or `!` after type: `feat!: rename enrollments.status to transit_status`

---

## Pull Request Requirements

Every PR must:

1. **Have a title matching Conventional Commits format** — the title becomes the squash commit message.

2. **Fill out the PR template** (`.github/pull_request_template.md`) completely. Empty sections will be flagged.

3. **Pass `npm run build`** with no TypeScript errors. The build is the minimum bar; PRs that don't build will not be reviewed.

4. **Include a migration** if any database schema changes. Migrations are numbered sequentially and must be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).

5. **Not bypass or disable any RLS policy** without a documented security justification in the PR body.

6. **Update `CHANGELOG.md`** under `[Unreleased]` with a concise bullet for every user-visible change.

7. **Keep scope tight.** One PR = one concern. Bundling unrelated changes makes review harder and rollback impossible.

### PR Size Guidelines

| Lines changed | Expectation |
|---|---|
| < 200 | Should be reviewable in one sitting |
| 200–800 | Add a summary section explaining the architecture |
| > 800 | Consider splitting unless it's a single atomic feature |

---

## Code Style

These are enforced by the project linter and must not be worked around:

### TypeScript

- **Strict mode is on.** No `any` without a comment explaining why. Use `unknown` and narrow explicitly.
- **No `@ts-ignore`.** Fix the type, don't suppress it.
- Prefer `interface` over `type` for object shapes. Use `type` for unions, intersections, and aliases.
- Export types from the file where they're defined; re-export from `src/types/` if used across multiple modules.

### React / Next.js

- **Server Components by default.** Only add `'use client'` when the component requires browser APIs or React state/effects.
- **Server Actions for all mutations.** Do not call Supabase mutating methods from client components directly — use `'use server'` functions in `src/app/actions/`.
- `createClient()` from `@/utils/supabase/server` is async — always `await` it in server components and actions.
- `createClient()` from `@/utils/supabase/client` is sync — for client components only.
- `createServiceClient()` is for privileged server-side operations (notifications, admin writes) only.

### Styling

- **Tailwind utility classes only.** No inline `style={{}}` for static values. Dynamic values (e.g., progress bar widths) are the exception and require a brief comment.
- Do not add custom CSS to `globals.css` without discussion. Prefer Tailwind plugins or `@layer utilities`.
- Use `cn()` from `@/lib/utils` for conditional class merging.
- **No emojis in production UI** without explicit design approval.

### Comments

- Write **zero comments** unless the WHY is non-obvious. Well-named variables and functions are the documentation.
- Never explain WHAT the code does. Never reference the PR, issue, or feature name in comments.
- One line maximum. No multi-line comment blocks in application code.

### File Organization

- Components live in `src/components/<domain>/`.
- App routes live in `src/app/<route>/`.
- Shared TypeScript types live in `src/types/`.
- Server actions live in `src/app/actions/`.
- API routes live in `src/app/api/`.

---

## Database & Migrations

### Rules

1. **Migrations are append-only.** Never edit a migration that has been pushed to the remote database. Write a new migration to correct mistakes.

2. **Name migrations descriptively:**
   ```
   20240601000029_discussion_and_enrollment_helpers.sql
   ```

3. **All new tables need:**
   - `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;`
   - At least one RLS policy
   - A primary key
   - Relevant indexes

4. **New SECURITY DEFINER functions must:**
   - Set `SET search_path = public` to prevent search path injection
   - Validate the caller's role at the top before any data access
   - Be GRANTed to `authenticated` explicitly

5. **Never use `auth.uid()` directly in policies.** Always use `current_user_uid()`.

6. **Test migrations locally** with `npx supabase db push` before opening a PR. Include migration verification (check the function/table exists) in the PR description.

### RLS Pattern Reference

```sql
-- Standard pattern: user owns their row
CREATE POLICY "table: user owns"
  ON public.my_table FOR ALL TO authenticated
  USING (user_id = current_user_uid());

-- Standard pattern: staff reads all
CREATE POLICY "table: staff reads"
  ON public.my_table FOR SELECT TO authenticated
  USING (current_user_role() IN ('admin', 'manager', 'teacher'));

-- Standard pattern: SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.my_function(p_arg UUID)
RETURNS TABLE (...)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role TEXT := current_user_role();
BEGIN
  IF v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  -- ... body
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_function(UUID) TO authenticated;
```

---

## Testing

There is currently no automated test suite (this is a known gap tracked in [Unreleased]). Until one is in place:

- **Manual testing is required before opening a PR.** The PR template has a testing checklist — fill it out.
- For auth-sensitive features, test as at least two different roles.
- For RLS-sensitive changes, verify that the restricted paths actually return empty results (not errors) for unauthorized users.
- `npm run build` must pass. TypeScript type errors are treated as bugs.

When a test suite is added, all new features must ship with tests.

---

## Changelog

Update `CHANGELOG.md` under `[Unreleased]` in every PR that makes a user-visible change. Use these section headers:

- `### Added` — new features
- `### Changed` — behavior changes to existing features
- `### Fixed` — bug fixes
- `### Removed` — removed features or endpoints
- `### Security` — security fixes (always note the severity)
- `### Migration` — database schema changes

Entries should be concise (one line) and written from the user's perspective, not the implementor's.

```markdown
### Added
- Discussion threads on block-type `discussion` — students can post one reply per block, all enrolled students can read replies
```

Not:
```markdown
### Added
- Added get_block_discussion_replies SECURITY DEFINER function and DiscussionPlayer client component
```
