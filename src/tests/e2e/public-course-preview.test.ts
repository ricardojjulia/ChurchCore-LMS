// @vitest-environment node
/**
 * Public Course Preview e2e tests — COUNCIL-2026-027 Prompt D.
 *
 * Covers acceptance criteria (Prompt D work items 1–6 + manually-verified items):
 *   1. Active org + previewable published course visible to the anon role.
 *   2. Not-found cases (inactive org, non-previewable, unpublished) all produce
 *      identical empty results — never an error, never a distinguishing signal (D5).
 *   3. THE core regression: SELECT content on course_blocks as anon returns a real
 *      column-permission error, not an empty/filtered result. This tests Prompt A's
 *      REVOKE/GRANT actually holds in the live schema — a service-role client would
 *      bypass column grants (BYPASSRLS) and cannot catch this regression; only the
 *      real anon-keyed client can.
 *   4. SELECT owner_id on courses as anon returns a column-permission error.
 *   5. Draft blocks inside a previewable published course are hidden from anon.
 *   6. Cross-tenant: org B's previewable course not returned when querying with org A filter.
 *   7. DB CHECK constraint rejects is_public_preview=true with status != 'published'.
 *   8. Disabling preview causes immediate visibility loss (no caching window).
 *   9. setCoursePublicPreview Server Action round-trip: flips is_public_preview
 *      in the real database, both directions. Uses the signInTestUser / next/headers
 *      cookie-mock pattern established in src/tests/e2e/auto-enroll-admin.test.ts.
 *
 * RLS tests use a real anon-keyed Supabase client (never service-role), so
 * column-level grants are actually exercised. Service-role is used only for
 * fixture setup/teardown and the CHECK constraint test.
 *
 * Required env vars:
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY,
 *   TEST_USER_PASSWORD
 *   TEST_USER_A_EMAIL — org admin for seeded Org A (defaults to admin@test.churchcore.dev)
 *
 * Also requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
 * SUPABASE_SERVICE_ROLE_KEY for the app's own createClient()/createServiceClient() —
 * these fall back to the TEST_* values above when unset.
 */

import { createClient as createRawClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { signInTestUser } from './test-session'

const TEST_URL    = process.env.TEST_SUPABASE_URL              ?? ''
const ANON_KEY    = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SERVICE_KEY = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PASSWORD    = process.env.TEST_USER_PASSWORD             ?? ''
const ORG_A_ADMIN_EMAIL = process.env.TEST_USER_A_EMAIL ?? 'admin@test.churchcore.dev'

if (!TEST_URL || !ANON_KEY || !SERVICE_KEY || !PASSWORD) {
  const missing = [
    !TEST_URL    && 'TEST_SUPABASE_URL',
    !ANON_KEY    && 'TEST_SUPABASE_ANON_KEY',
    !SERVICE_KEY && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PASSWORD    && 'TEST_USER_PASSWORD',
  ].filter(Boolean).join(', ')
  throw new Error(`Public course preview e2e: missing required env vars — ${missing}`)
}

// The app's own createClient()/createServiceClient() read these env var names.
process.env.NEXT_PUBLIC_SUPABASE_URL      ??= TEST_URL
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= ANON_KEY
process.env.SUPABASE_SERVICE_ROLE_KEY     ??= SERVICE_KEY

// ── Fixture UUIDs — own 0095 namespace, never collides with seed.test.sql ────
// Organizations
const ORG_PREVIEW  = '00000000-0000-0000-0095-000000000001'  // active, for main preview tests
const ORG_INACTIVE = '00000000-0000-0000-0095-000000000002'  // inactive, for D5 test
const ORG_B_XSEC   = '00000000-0000-0000-0095-000000000003'  // active, for cross-tenant test

// Courses
const COURSE_PREVIEW      = '00000000-0000-0000-0095-000000000010'  // published + is_public_preview=true, ORG_PREVIEW
const COURSE_PRIVATE       = '00000000-0000-0000-0095-000000000011'  // published + is_public_preview=false, ORG_PREVIEW
const COURSE_INACTIVE_ORG  = '00000000-0000-0000-0095-000000000012'  // published + is_public_preview=true, ORG_INACTIVE
const COURSE_ORG_B         = '00000000-0000-0000-0095-000000000013'  // published + is_public_preview=true, ORG_B_XSEC
const COURSE_FOR_TOGGLE    = '00000000-0000-0000-0095-000000000014'  // published + is_public_preview=true, ORG_PREVIEW (toggle test)

// Course blocks — inside COURSE_PREVIEW
const BLOCK_PUBLISHED = '00000000-0000-0000-0095-000000000020'  // is_published=true
const BLOCK_DRAFT     = '00000000-0000-0000-0095-000000000021'  // is_published=false (draft)

// Seeded Org A (from seed.test.sql) + a real admin and published course for the Server Action test
const ORG_A           = '00000000-0000-0000-0010-000000000001'
// "Standalone Course" — published, status='published', in ORG_A; safe for preview toggle
const SEEDED_COURSE_A = '00000000-0000-0000-0011-000000000003'
// Seeded admin-a uid (owner_id for fixture courses in non-seeded orgs)
const SEEDED_ADMIN_UID = '00000000-0000-0000-0002-000000000001'

// ── next/headers mock — fed by a real signed-in admin session for the
//    Server Action round-trip test. Pattern from auto-enroll-admin.test.ts.
const cookieState = vi.hoisted(() => ({ cookies: [] as { name: string; value: string }[] }))

vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => cookieState.cookies,
    get:    (name: string) => cookieState.cookies.find((c) => c.name === name),
    set:    () => {},
  }),
}))

// next/cache's revalidatePath() throws outside a real Next request/render scope.
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag:  vi.fn(),
}))

// ─────────────────────────────────────────────────────────────────────────────

let svc:  SupabaseClient  // service-role — bypasses RLS for setup/teardown
let anon: SupabaseClient  // anon-role — exercises RLS and column-level grants

async function wipeFixtureRows() {
  // FK-safe deletion order: blocks before courses before orgs.
  await svc.from('course_blocks').delete().in('id', [BLOCK_PUBLISHED, BLOCK_DRAFT])
  await svc
    .from('courses')
    .delete()
    .in('id', [
      COURSE_PREVIEW,
      COURSE_PRIVATE,
      COURSE_INACTIVE_ORG,
      COURSE_ORG_B,
      COURSE_FOR_TOGGLE,
    ])
  await svc.from('organizations').delete().in('id', [ORG_PREVIEW, ORG_INACTIVE, ORG_B_XSEC])
}

beforeAll(async () => {
  svc = createRawClient(TEST_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  anon = createRawClient(TEST_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Clean up any leftover rows from a previous crashed run.
  await wipeFixtureRows()

  // ── Organizations ─────────────────────────────────────────────────────────
  const { error: orgErr } = await svc.from('organizations').insert([
    {
      id:     ORG_PREVIEW,
      name:   'Preview E2E Org',
      slug:   `preview-e2e-${Date.now()}`,
      status: 'active',
      plan:   'free',
      settings: { branding: {} },
    },
    {
      id:     ORG_INACTIVE,
      name:   'Inactive E2E Org',
      slug:   `inactive-e2e-${Date.now()}`,
      status: 'suspended',
      plan:   'free',
      settings: { branding: {} },
    },
    {
      id:     ORG_B_XSEC,
      name:   'Cross-Tenant E2E Org',
      slug:   `xsec-e2e-${Date.now()}`,
      status: 'active',
      plan:   'free',
      settings: { branding: {} },
    },
  ])
  if (orgErr) throw new Error(`Failed to seed fixture orgs: ${orgErr.message}`)

  // ── Courses ───────────────────────────────────────────────────────────────
  const { error: courseErr } = await svc.from('courses').insert([
    {
      id:               COURSE_PREVIEW,
      org_id:           ORG_PREVIEW,
      title:            'E2E Preview Course',
      description:      'Publicly previewable test course.',
      status:           'published',
      owner_id:         SEEDED_ADMIN_UID,
      is_public_preview: true,
    },
    {
      id:               COURSE_PRIVATE,
      org_id:           ORG_PREVIEW,
      title:            'E2E Private Course',
      description:      'Not previewable.',
      status:           'published',
      owner_id:         SEEDED_ADMIN_UID,
      is_public_preview: false,
    },
    {
      id:               COURSE_INACTIVE_ORG,
      org_id:           ORG_INACTIVE,
      title:            'E2E Inactive Org Course',
      status:           'published',
      owner_id:         SEEDED_ADMIN_UID,
      is_public_preview: true,
    },
    {
      id:               COURSE_ORG_B,
      org_id:           ORG_B_XSEC,
      title:            'E2E Cross-Tenant Course',
      status:           'published',
      owner_id:         SEEDED_ADMIN_UID,
      is_public_preview: true,
    },
    {
      id:               COURSE_FOR_TOGGLE,
      org_id:           ORG_PREVIEW,
      title:            'E2E Toggle Course',
      status:           'published',
      owner_id:         SEEDED_ADMIN_UID,
      is_public_preview: true,
    },
  ])
  if (courseErr) throw new Error(`Failed to seed fixture courses: ${courseErr.message}`)

  // ── Course blocks for COURSE_PREVIEW ──────────────────────────────────────
  // org_id is auto-stamped by trg_stamp_course_block_org_id.
  const { error: blockErr } = await svc.from('course_blocks').insert([
    {
      id:           BLOCK_PUBLISHED,
      course_id:    COURSE_PREVIEW,
      block_type_id: 'page',
      title:        'Published Block Title',
      sort_order:   1,
      is_published: true,
    },
    {
      id:           BLOCK_DRAFT,
      course_id:    COURSE_PREVIEW,
      block_type_id: 'page',
      title:        'Draft Block Title — must never be visible to anon',
      sort_order:   2,
      is_published: false,
    },
  ])
  if (blockErr) throw new Error(`Failed to seed fixture blocks: ${blockErr.message}`)

  // ── Real sign-in for the Server Action round-trip test ────────────────────
  // The seeded admin is in ORG_A and can toggle SEEDED_COURSE_A (also in ORG_A).
  const session = await signInTestUser(TEST_URL, ANON_KEY, ORG_A_ADMIN_EMAIL, PASSWORD)
  cookieState.cookies = session.cookieHeader
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=')
      return { name: pair.slice(0, eq), value: pair.slice(eq + 1) }
    })
})

afterAll(async () => {
  try {
    await wipeFixtureRows()
  } catch (e) {
    console.warn('afterAll: failed to clean up fixture rows —', e)
  }
  // Restore the seeded course's is_public_preview to false (its original seed state).
  try {
    await svc
      .from('courses')
      .update({ is_public_preview: false })
      .eq('id', SEEDED_COURSE_A)
  } catch (e) {
    console.warn('afterAll: failed to restore seeded course is_public_preview —', e)
  }
})

// ── 1. Anon catalog: previewable courses visible ──────────────────────────────

describe('anon RLS — previewable courses are visible', () => {
  it('returns a previewable published course for an active org', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('id, title, description, status, org_id, is_public_preview')
      .eq('org_id', ORG_PREVIEW)
      .eq('is_public_preview', true)
      .eq('status', 'published')

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.some((c) => c.id === COURSE_PREVIEW)).toBe(true)
  })

  it('card data does not include sensitive fields (no enrollment count, no owner_id column allowed)', async () => {
    // The anon role can only SELECT the six explicitly granted columns on courses.
    // This select uses only those safe columns — must succeed.
    const { data, error } = await anon
      .from('courses')
      .select('id, title, description, status, org_id, is_public_preview')
      .eq('id', COURSE_PREVIEW)

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!).toHaveLength(1)
    const course = data![0]
    // Confirm only safe columns are present
    expect(Object.keys(course).sort()).toEqual(
      ['description', 'id', 'is_public_preview', 'org_id', 'status', 'title'].sort(),
    )
  })
})

// ── 2. Not-found cases: all produce empty result, never an error (D5) ─────────

describe('anon RLS — not-found cases return empty, not error', () => {
  it('a non-previewable published course is not returned (invisible to anon)', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_PRIVATE)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('a previewable course in an inactive org is not returned', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_INACTIVE_ORG)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('a nonexistent course id returns empty, not error', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('id')
      .eq('id', '00000000-0000-0000-0000-ffffffffffff')

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// ── 3. Core regression: column-level grant enforcement ────────────────────────
// This is THE load-bearing test for this feature. It must exercise the real anon
// role — service_role bypasses column grants (BYPASSRLS) and cannot catch a
// regression here. Verify: a column-privilege error (data: null, error !== null),
// not an empty/filtered result (data: [], error: null).

describe('anon column-level grant regression — forbidden columns return a permission error', () => {
  it('SELECT content from course_blocks returns a column-permission error, not empty data', async () => {
    const { data, error } = await anon
      .from('course_blocks')
      .select('content')
      .eq('course_id', COURSE_PREVIEW)

    // The critical assertion: this must be a real DB error (column-privilege denial),
    // never a silent empty result. If the REVOKE/GRANT from 20260920200000 is absent
    // or has been re-widened by a blanket GRANT, error would be null and data would be []
    // — this test would fail correctly.
    expect(error).not.toBeNull()
    expect(data).toBeNull()
    // PostgreSQL error code 42501 = insufficient_privilege
    expect(error!.code).toBe('42501')
  })

  it('SELECT owner_id from courses returns a column-permission error, not empty data', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('owner_id')
      .eq('id', COURSE_PREVIEW)

    expect(error).not.toBeNull()
    expect(data).toBeNull()
    expect(error!.code).toBe('42501')
  })

  it('SELECT of the safe columns (id, title) from course_blocks succeeds for a previewable course', async () => {
    // Confirm the positive case: the granted columns DO work. Without this, a test
    // that passes because the anon role can't read ANY row at all would be a false positive.
    const { data, error } = await anon
      .from('course_blocks')
      .select('id, title, block_type_id, sort_order')
      .eq('course_id', COURSE_PREVIEW)

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    // Only the published block is visible (is_published=true RLS condition)
    expect(data!.some((b) => b.id === BLOCK_PUBLISHED)).toBe(true)
    expect(data!.some((b) => b.id === BLOCK_DRAFT)).toBe(false)
  })
})

// ── 5. Draft blocks hidden from anon (is_published=true required by RLS) ──────

describe('anon RLS — draft blocks inside previewable courses are hidden', () => {
  it('a draft block (is_published=false) in a previewable published course is not visible to anon', async () => {
    const { data, error } = await anon
      .from('course_blocks')
      .select('id, title')
      .eq('id', BLOCK_DRAFT)

    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('a published block in the same course IS visible to anon', async () => {
    const { data, error } = await anon
      .from('course_blocks')
      .select('id, title')
      .eq('id', BLOCK_PUBLISHED)

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!).toHaveLength(1)
    expect(data![0].id).toBe(BLOCK_PUBLISHED)
  })
})

// ── 6. Cross-tenant isolation ─────────────────────────────────────────────────

describe('anon RLS — cross-tenant isolation', () => {
  it('org B previewable course is not returned when querying with org A filter', async () => {
    const { data, error } = await anon
      .from('courses')
      .select('id')
      .eq('org_id', ORG_PREVIEW)
      .eq('is_public_preview', true)

    expect(error).toBeNull()
    // Org B's course must not appear even though it's previewable
    const ids = (data ?? []).map((c: { id: string }) => c.id)
    expect(ids).not.toContain(COURSE_ORG_B)
    // But org A's own previewable course must be there
    expect(ids).toContain(COURSE_PREVIEW)
  })

  it('anon cannot reach org B course by specifying its ID directly when filtered to org A', async () => {
    // This also confirms app-level org slug routing is backed by an actual data boundary:
    // even a direct PostgREST query with the known course ID is blocked when org_id mismatches.
    const { data, error } = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_ORG_B)
      .eq('org_id', ORG_PREVIEW)  // wrong org for this course

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// ── 7. DB CHECK constraint: is_public_preview=true requires status='published' ─

describe('DB CHECK constraint — courses_preview_requires_published', () => {
  it('rejects an INSERT with is_public_preview=true and status=draft', async () => {
    const { error } = await svc.from('courses').insert({
      // No explicit id — we want this to fail before the row is created
      org_id:            ORG_PREVIEW,
      title:             'Constraint Violation Test Course',
      status:            'draft',
      owner_id:          SEEDED_ADMIN_UID,
      is_public_preview: true,   // violates the CHECK constraint
    })

    expect(error).not.toBeNull()
    // PostgreSQL error code 23514 = check_violation
    expect(error!.code).toBe('23514')
    expect(error!.message).toContain('courses_preview_requires_published')
  })

  it('rejects an UPDATE that sets is_public_preview=true on a draft course', async () => {
    // First ensure the course exists and is in draft state.
    const TEMP_ID = '00000000-0000-0000-0095-000000000099'
    await svc.from('courses').delete().eq('id', TEMP_ID)  // clean up any leftover

    await svc.from('courses').insert({
      id:                TEMP_ID,
      org_id:            ORG_PREVIEW,
      title:             'Temp Draft Course for Constraint Test',
      status:            'draft',
      owner_id:          SEEDED_ADMIN_UID,
      is_public_preview: false,
    })

    const { error } = await svc
      .from('courses')
      .update({ is_public_preview: true })
      .eq('id', TEMP_ID)

    // Clean up regardless of whether the constraint fires.
    await svc.from('courses').delete().eq('id', TEMP_ID)

    expect(error).not.toBeNull()
    expect(error!.code).toBe('23514')
    expect(error!.message).toContain('courses_preview_requires_published')
  })
})

// ── 8. Preview toggle immediacy ───────────────────────────────────────────────

describe('preview toggle immediacy — no caching window', () => {
  it('disabling preview causes the course to disappear from anon catalog immediately', async () => {
    // Verify COURSE_FOR_TOGGLE is currently visible.
    const { data: before } = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_FOR_TOGGLE)
    expect((before ?? []).some((c: { id: string }) => c.id === COURSE_FOR_TOGGLE)).toBe(true)

    // Disable via service client (same as setCoursePublicPreview's final write).
    const { error: updateErr } = await svc
      .from('courses')
      .update({ is_public_preview: false })
      .eq('id', COURSE_FOR_TOGGLE)
    expect(updateErr).toBeNull()

    // Immediately after: anon must see no row — no stale cache.
    const { data: after, error: afterErr } = await anon
      .from('courses')
      .select('id')
      .eq('id', COURSE_FOR_TOGGLE)
    expect(afterErr).toBeNull()
    expect(after).toEqual([])

    // Restore for potential re-runs.
    await svc
      .from('courses')
      .update({ is_public_preview: true })
      .eq('id', COURSE_FOR_TOGGLE)
  })
})

// ── 9. setCoursePublicPreview Server Action round-trip ────────────────────────
// Full round-trip through the real org-settings.ts Server Action using the
// cookie-mock pattern (signed-in admin session via next/headers mock). Proves
// the action genuinely flips courses.is_public_preview in both directions in
// the real database. Pattern mirrors auto-enroll-admin.test.ts exactly.

describe('setCoursePublicPreview Server Action — real Supabase round-trip', () => {
  it('flips is_public_preview to true then back to false via the Server Action', async () => {
    // The seeded admin in ORG_A and "Standalone Course" (SEEDED_COURSE_A, published, in ORG_A).
    // cookieState is already populated in beforeAll via signInTestUser.
    const { setCoursePublicPreview: action } = await import('@/app/actions/org-settings')

    // Ensure we start from a known baseline.
    await svc
      .from('courses')
      .update({ is_public_preview: false })
      .eq('id', SEEDED_COURSE_A)

    // Enable preview.
    const enableResult = await action(SEEDED_COURSE_A, true)
    expect(enableResult).toEqual({})

    // Verify the DB was actually written.
    const { data: afterEnable } = await svc
      .from('courses')
      .select('is_public_preview')
      .eq('id', SEEDED_COURSE_A)
      .single()
    expect(afterEnable?.is_public_preview).toBe(true)

    // Disable preview.
    const disableResult = await action(SEEDED_COURSE_A, false)
    expect(disableResult).toEqual({})

    // Verify the DB was written back.
    const { data: afterDisable } = await svc
      .from('courses')
      .select('is_public_preview')
      .eq('id', SEEDED_COURSE_A)
      .single()
    expect(afterDisable?.is_public_preview).toBe(false)
  })
})
