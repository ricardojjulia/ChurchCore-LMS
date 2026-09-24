// @vitest-environment node
// Regression tests for the admin user-management fixes in the privilege-
// escalation hotfix: every write is scoped to the admin's own org, admins
// cannot target themselves, and invites assign org + role server-side.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ORG_A = 'org-a'
const ORG_B = 'org-b'

const m = vi.hoisted(() => ({
  caller: { uid: 'admin-uid', role: 'admin', org_id: 'org-a' } as Record<string, unknown> | null,
  targets: {} as Record<string, { uid: string; auth_id: string; org_id: string }>,
  updates: [] as Array<{ values: unknown; filters: Array<[string, unknown]> }>,
  deleted: [] as string[],
  invited: [] as string[],
  appMeta: [] as Array<[string, unknown]>,
}))

function sessionClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-auth' } } }) },
    from: () => {
      const q = { select: () => q, eq: () => q, single: async () => ({ data: m.caller }) }
      return q
    },
  }
}

function serviceClient() {
  return {
    auth: {
      admin: {
        deleteUser: async (id: string) => { m.deleted.push(id); return { error: null } },
        inviteUserByEmail: async (email: string) => { m.invited.push(email); return { data: { user: { id: `auth-${email}` } }, error: null } },
        updateUserById: async (id: string, attrs: { app_metadata: unknown }) => { m.appMeta.push([id, attrs.app_metadata]); return { error: null } },
      },
    },
    from: () => {
      const filters: Array<[string, unknown]> = []
      let pendingUpdate: unknown = null
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filters.push([c, v]); return q },
        update: (values: unknown) => { pendingUpdate = values; return q },
        maybeSingle: async () => {
          const uid = filters.find(([c]) => c === 'uid')?.[1] as string
          const org = filters.find(([c]) => c === 'org_id')?.[1]
          const t = m.targets[uid]
          return { data: t && t.org_id === org ? t : null }
        },
        then: (resolve: (v: unknown) => void) => {
          if (pendingUpdate) m.updates.push({ values: pendingUpdate, filters: [...filters] })
          return Promise.resolve({ error: null }).then(resolve)
        },
      }
      return q
    },
  }
}

vi.mock('@/utils/supabase/server', () => ({ createClient: async () => sessionClient() }))
vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => serviceClient() }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { deleteUser, inviteUser, updateUserRole, updateUserStatus } from './admin'

beforeEach(() => {
  m.caller = { uid: 'admin-uid', role: 'admin', org_id: ORG_A }
  m.targets = {
    'same-org': { uid: 'same-org', auth_id: 'auth-same', org_id: ORG_A },
    'other-org': { uid: 'other-org', auth_id: 'auth-other', org_id: ORG_B },
  }
  m.updates = []; m.deleted = []; m.invited = []; m.appMeta = []
})

describe('updateUserRole', () => {
  it('updates a user in the admin’s own org, scoped by org_id, and syncs app_metadata', async () => {
    expect(await updateUserRole('same-org', 'teacher')).toEqual({ success: true })
    expect(m.updates[0]).toMatchObject({ values: { role: 'teacher' } })
    expect(m.updates[0].filters).toContainEqual(['org_id', ORG_A])
    expect(m.appMeta).toContainEqual(['auth-same', { org_id: ORG_A, role: 'teacher' }])
  })

  it('cannot reach a user in another org', async () => {
    expect(await updateUserRole('other-org', 'admin')).toEqual({ error: 'User not found.' })
    expect(m.updates).toHaveLength(0)
  })

  it('cannot change the admin’s own role, or set an unknown role', async () => {
    expect(await updateUserRole('admin-uid', 'student')).toEqual({ error: 'You cannot change your own role.' })
    expect(await updateUserRole('same-org', 'superuser' as never)).toEqual({ error: 'Invalid role.' })
    expect(m.updates).toHaveLength(0)
  })

  it('rejects non-admins', async () => {
    m.caller = { uid: 't', role: 'teacher', org_id: ORG_A }
    await expect(updateUserRole('same-org', 'admin')).rejects.toThrow('Forbidden')
  })
})

describe('updateUserStatus', () => {
  it('is org-scoped', async () => {
    expect(await updateUserStatus('other-org', 'suspended')).toEqual({ error: 'User not found.' })
    expect(await updateUserStatus('same-org', 'suspended')).toEqual({ success: true })
    expect(m.updates).toHaveLength(1)
  })
})

describe('deleteUser', () => {
  it('only deletes users in the admin’s own org, never themselves', async () => {
    expect(await deleteUser('other-org')).toEqual({ error: 'User not found.' })
    expect(await deleteUser('admin-uid')).toEqual({ error: 'You cannot delete your own account here.' })
    expect(m.deleted).toEqual([])
    expect(await deleteUser('same-org')).toEqual({ success: true })
    expect(m.deleted).toEqual(['auth-same'])
  })
})

describe('inviteUser', () => {
  it('assigns the invitee to the admin’s org with the chosen role (server-side)', async () => {
    const res = await inviteUser('new@example.org', 'teacher')
    expect(res).toMatchObject({ success: true })
    expect(m.appMeta).toContainEqual(['auth-new@example.org', { org_id: ORG_A, role: 'teacher' }])
    expect(m.updates.at(-1)).toMatchObject({ values: { org_id: ORG_A, role: 'teacher' } })
  })
})
