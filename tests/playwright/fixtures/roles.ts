// COUNCIL-2026-031 D3 — every seeded identity the suite can act as.
// Emails match scripts/ci-setup-test-env.mjs; UIDs match seed.test.sql / seed.suite.sql.

export type Role =
  | 'admin' | 'manager' | 'teacher' | 'student' | 'guardian' | 'platform'
  | 'admin-b' | 'student-b'

export type Actor = Role | 'anon'

export const ORG_A = '00000000-0000-0000-0010-000000000001'
export const ORG_B = '00000000-0000-0000-0010-000000000002'

export const USERS: Record<Role, { email: string; uid: string; org: string; orgRole: string }> = {
  admin:       { email: 'admin@test.churchcore.dev',     uid: '00000000-0000-0000-0002-000000000001', org: ORG_A, orgRole: 'admin' },
  teacher:     { email: 'teacher@test.churchcore.dev',   uid: '00000000-0000-0000-0002-000000000002', org: ORG_A, orgRole: 'teacher' },
  student:     { email: 'student@test.churchcore.dev',   uid: '00000000-0000-0000-0002-000000000003', org: ORG_A, orgRole: 'student' },
  'admin-b':   { email: 'admin-b@test.churchcore.dev',   uid: '00000000-0000-0000-0002-000000000004', org: ORG_B, orgRole: 'admin' },
  'student-b': { email: 'student-b@test.churchcore.dev', uid: '00000000-0000-0000-0002-000000000005', org: ORG_B, orgRole: 'student' },
  guardian:    { email: 'guardian@test.churchcore.dev',  uid: '00000000-0000-0000-0002-000000000006', org: ORG_A, orgRole: 'guardian' },
  manager:     { email: 'manager@test.churchcore.dev',   uid: '00000000-0000-0000-0002-000000000007', org: ORG_A, orgRole: 'manager' },
  // Org role is 'student' on purpose: platform powers come only from platform_admins.
  platform:    { email: 'platform@test.churchcore.dev',  uid: '00000000-0000-0000-0002-000000000008', org: ORG_A, orgRole: 'student' },
}

export const ROLES = Object.keys(USERS) as Role[]

// Role sets used by route/API tables. Org-B identities only matter for
// cross-tenant checks, so sweeps use the Org-A set.
export const ORG_A_ROLES: Role[] = ['admin', 'manager', 'teacher', 'student', 'guardian', 'platform']
export const STAFF: Role[] = ['admin', 'manager', 'teacher']
export const ADMINS: Role[] = ['admin', 'manager']

export const storageStatePath = (role: Role) => `tests/playwright/.auth/${role}.json`
