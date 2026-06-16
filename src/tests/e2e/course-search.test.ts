// @vitest-environment node
/**
 * Course Search Route Integration Tests
 * COUNCIL-2025-005 GAP-007 — /api/search course status fix
 *
 * Verifies that:
 *   1. GET /api/search?q= returns 401 when unauthenticated.
 *   2. Results include only courses with status='published' — not drafts.
 *   3. An empty-match query returns an empty array with a user-facing message.
 *   4. Results include blueprint data (course_code, blueprint title) when present.
 *   5. Results are ordered alphabetically by title.
 *
 * Prerequisites:
 *   - A test runner (Jest / Vitest) must be configured before these run.
 *   - APP_BASE_URL, SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_KEY env vars must be set.
 *   - TEST_STUDENT_TOKEN must be a valid Supabase access token for any authenticated user.
 *   - Seed data must include:
 *       • At least one course with status='published' and title matching TEST_SEARCH_TERM
 *       • At least one course with status='draft' and title matching TEST_SEARCH_TERM
 *       • At least one published course linked to a course_blueprint with a course_code
 *
 * Run: npx vitest src/tests/e2e/course-search.test.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

const BASE_URL       = process.env.APP_BASE_URL              ?? 'http://localhost:3000'
const TEST_URL       = process.env.SUPABASE_TEST_URL         ?? ''
const SERVICE_KEY    = process.env.SUPABASE_TEST_SERVICE_KEY ?? ''
const STUDENT_TOKEN  = process.env.TEST_STUDENT_TOKEN        ?? ''
const SEARCH_TERM    = process.env.TEST_SEARCH_TERM          ?? 'Introduction'
const DRAFT_TITLE    = process.env.TEST_DRAFT_COURSE_TITLE   ?? 'Draft Introduction Course'

function serviceClient(): SupabaseClient {
  return createClient(TEST_URL, SERVICE_KEY)
}

async function searchCourses(
  q: string,
  token?: string,
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const url = `${BASE_URL}/api/search?q=${encodeURIComponent(q)}`
  const res = await fetch(url, { headers })
  let body: unknown
  try { body = await res.json() } catch { body = null }
  return { status: res.status, body }
}

// ── Authentication guard ───────────────────────────────────────────────────────

describe('GET /api/search — auth guard', () => {
  it('returns 401 when no token is provided', async () => {
    const { status } = await searchCourses(SEARCH_TERM)
    expect(status).toBe(401)
  })
})

// ── Published-only filter ──────────────────────────────────────────────────────

describe('GET /api/search — published-only results', () => {
  it('returns only courses with status="published", not draft courses', async () => {
    const { status, body } = await searchCourses(SEARCH_TERM, STUDENT_TOKEN)
    expect(status).toBe(200)

    const courses = (body as { courses: { title: string; status?: string }[] }).courses
    const draftInResults = courses.some((c) => c.title === DRAFT_TITLE)
    expect(draftInResults).toBe(false)
  })

  it('includes at least one published course when the search term matches', async () => {
    const { body } = await searchCourses(SEARCH_TERM, STUDENT_TOKEN)
    const courses = (body as { courses: unknown[] }).courses
    expect(courses.length).toBeGreaterThan(0)
  })
})

// ── Empty-state handling ───────────────────────────────────────────────────────

describe('GET /api/search — empty state', () => {
  it('returns an empty courses array with a user-facing message for an unmatched query', async () => {
    const { status, body } = await searchCourses(
      '__no_course_will_ever_match_this_xyz987__',
      STUDENT_TOKEN,
    )
    expect(status).toBe(200)

    const typed = body as { courses: unknown[]; message?: string }
    expect(typed.courses).toHaveLength(0)
    expect(typeof typed.message).toBe('string')
    expect(typed.message!.length).toBeGreaterThan(0)
  })
})

// ── Blueprint data ─────────────────────────────────────────────────────────────

describe('GET /api/search — blueprint join', () => {
  it('includes course_blueprints data on courses that have a blueprint_id', async () => {
    const { body } = await searchCourses(SEARCH_TERM, STUDENT_TOKEN)
    const courses = (body as { courses: { course_blueprints?: unknown }[] }).courses

    // At least one result should carry blueprint data (seed data must include one)
    const withBlueprint = courses.find((c) => c.course_blueprints !== null)
    expect(withBlueprint).toBeDefined()
  })
})

// ── Sort order ─────────────────────────────────────────────────────────────────

describe('GET /api/search — result ordering', () => {
  it('returns results sorted alphabetically by title ascending', async () => {
    const { body } = await searchCourses('', STUDENT_TOKEN)
    const courses = (body as { courses: { title: string }[] }).courses

    if (courses.length < 2) return // not enough data to assert ordering

    for (let i = 1; i < courses.length; i++) {
      expect(courses[i - 1].title.localeCompare(courses[i].title)).toBeLessThanOrEqual(0)
    }
  })
})
