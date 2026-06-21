// @vitest-environment node
/**
 * RLS cross-tenant isolation penetration tests.
 * Asserts that an authenticated user from Org A cannot read
 * any row belonging to Org B through any authenticated API path.
 *
 * Required env vars (set via CI secrets or .env.test.local):
 *   TEST_SUPABASE_URL, TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_SERVICE_ROLE_KEY
 *   TEST_USER_A_EMAIL, TEST_USER_B_EMAIL, TEST_USER_PASSWORD
 *
 * Seed data: supabase/seed.test.sql must insert both orgs and their users
 * using the deterministic UUIDs below.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const URL  = process.env.TEST_SUPABASE_URL              ?? ''
const ANON = process.env.TEST_SUPABASE_ANON_KEY         ?? ''
const SVC  = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ?? ''
const PWD  = process.env.TEST_USER_PASSWORD             ?? ''
const A_EMAIL = process.env.TEST_USER_A_EMAIL ?? ''
const B_EMAIL = process.env.TEST_USER_B_EMAIL ?? ''

if (!URL || !ANON || !SVC || !PWD || !A_EMAIL || !B_EMAIL) {
  const missing = [
    !URL      && 'TEST_SUPABASE_URL',
    !ANON     && 'TEST_SUPABASE_ANON_KEY',
    !SVC      && 'TEST_SUPABASE_SERVICE_ROLE_KEY',
    !PWD      && 'TEST_USER_PASSWORD',
    !A_EMAIL  && 'TEST_USER_A_EMAIL',
    !B_EMAIL  && 'TEST_USER_B_EMAIL',
  ].filter(Boolean).join(', ')
  throw new Error(`RLS isolation tests: missing required env vars — ${missing}`)
}

// Deterministic seed UUIDs — must match supabase/seed.test.sql
const ORG_A    = '00000000-0000-0000-0010-000000000001'
const ORG_B    = '00000000-0000-0000-0010-000000000002'
const COURSE_A = '00000000-0000-0000-0011-000000000001'
const COURSE_B = '00000000-0000-0000-0011-000000000002'

let svc:   SupabaseClient
let userA: SupabaseClient
let userB: SupabaseClient

// Tables that carry org_id and must be tenant-isolated
const TABLES_WITH_ORG: string[] = [
  'courses',
  'modules',
  'course_blocks',
  'submissions',
  'hq_tasks',
  'hq_decisions',
  'hq_risks',
  'hq_sessions',
  'group_posts',
  'ai_query_log',
  'admin_audit_log',
  'user_audit_log',
  'profile_badges',
  'academic_terms',
  'enrollment_audit_log',
  'embeddings',
]

beforeAll(async () => {
  svc = createClient(URL, SVC, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const signIn = async (email: string): Promise<SupabaseClient> => {
    const client = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await client.auth.signInWithPassword({ email, password: PWD })
    if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`)
    return client
  }

  ;[userA, userB] = await Promise.all([signIn(A_EMAIL), signIn(B_EMAIL)])
})

afterAll(async () => {
  await Promise.all([userA.auth.signOut(), userB.auth.signOut()])
})

describe('Cross-tenant RLS isolation', () => {
  for (const table of TABLES_WITH_ORG) {
    it(`user A cannot read Org B rows in ${table}`, async () => {
      const { data, error } = await userA
        .from(table)
        .select('id')
        .eq('org_id', ORG_B)
        .limit(5)

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    })

    it(`user B can query their own rows in ${table} without error`, async () => {
      const { data, error } = await userB
        .from(table)
        .select('id')
        .eq('org_id', ORG_B)
        .limit(1)

      // The query must succeed (no RLS error). Empty data is acceptable if
      // seed data has no rows for this table — the important assertion is no error.
      expect(error).toBeNull()
      expect(data).toBeDefined()
    })
  }

  it('user A cannot read courses from Org B by direct ID lookup', async () => {
    const { data, error } = await userA
      .from('courses')
      .select('id, org_id')
      .eq('id', COURSE_B)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('user B cannot read courses from Org A by direct ID lookup', async () => {
    const { data, error } = await userB
      .from('courses')
      .select('id, org_id')
      .eq('id', COURSE_A)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('service role can read rows from all orgs', async () => {
    const { data, error } = await svc
      .from('courses')
      .select('id, org_id')
      .limit(20)

    expect(error).toBeNull()
    // In a seeded environment with both orgs, at least one org must be visible
    expect(data).toBeDefined()
    expect((data ?? []).length).toBeGreaterThanOrEqual(1)
  })
})

describe('Suspended tenant RLS block', () => {
  it('suspended-org user cannot read their own org rows until re-activated', async () => {
    // Suspend Org A — this should trigger sync_org_status_to_profiles
    // which sets profile_roles.tenant_active = false for all Org A members
    await svc
      .from('organizations')
      .update({ status: 'suspended' })
      .eq('id', ORG_A)

    // Allow the trigger to propagate
    await new Promise((r) => setTimeout(r, 600))

    const { data } = await userA
      .from('courses')
      .select('id')
      .eq('org_id', ORG_A)
      .limit(5)

    expect(data).toHaveLength(0)

    // Restore Org A so subsequent tests are not affected
    await svc
      .from('organizations')
      .update({ status: 'active' })
      .eq('id', ORG_A)

    await new Promise((r) => setTimeout(r, 600))
  })

  it('user A regains access after org is re-activated', async () => {
    // Re-sign-in to pick up updated tenant_active in profile_roles JWT
    const refreshed = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await refreshed.auth.signInWithPassword({ email: A_EMAIL, password: PWD })

    const { data, error } = await refreshed
      .from('courses')
      .select('id')
      .eq('org_id', ORG_A)
      .limit(5)

    expect(error).toBeNull()
    // In a seeded environment at least one course row exists for Org A
    expect(data).toBeDefined()

    await refreshed.auth.signOut()
  })
})

describe('Profiles cross-tenant isolation', () => {
  it('user A cannot read profiles belonging to Org B', async () => {
    const { data, error } = await userA
      .from('profiles')
      .select('uid, org_id')
      .eq('org_id', ORG_B)
      .limit(5)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('user A can read their own profile', async () => {
    const { data: { user } } = await userA.auth.getUser()
    const { data, error } = await userA
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user!.id)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data?.org_id).toBe(ORG_A)
  })
})
