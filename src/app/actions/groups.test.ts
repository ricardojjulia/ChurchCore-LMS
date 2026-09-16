import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { addGroupMember, createGroup, createThread, deleteGroup, postToThread, removeGroupMember, softDeletePost } from './groups'

type Result = { data: unknown; error: { code?: string; message: string } | null }
function mockActor(role = 'student', overrides: Record<string, Result> = {}, signedIn = true) {
  const writes: Record<string, unknown> = {}
  const filters: Record<string, unknown[][]> = {}
  const defaults: Record<string, Result> = {
    profiles: { data: { role, org_id: 'org-a', auth_id: 'member-auth' }, error: null },
    course_sections: { data: { id: 'section' }, error: null },
    section_groups: { data: { id: 'group' }, error: null },
    group_threads: { data: { id: 'thread', is_locked: false }, error: null },
    group_posts: { data: null, error: null },
    section_group_members: { data: null, error: null },
  }
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: signedIn ? { id: 'actor-auth' } : null } }) },
    from: vi.fn((table: string) => {
      const query: Record<string, unknown> = {}
      for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'single', 'maybeSingle']) {
        query[method] = (...args: unknown[]) => {
          if (method === 'insert' || method === 'update') writes[table] = args[0]
          if (method === 'eq') (filters[table] ??= []).push(args)
          return query
        }
      }
      query.then = (resolve: (value: Result) => void) => Promise.resolve(overrides[table] ?? defaults[table]).then(resolve)
      return query
    }),
  }
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>)
  return { writes, filters }
}

beforeEach(() => vi.clearAllMocks())

describe('group mutations', () => {
  it('rejects unauthenticated callers for every mutation', async () => {
    mockActor('student', {}, false)
    const results = await Promise.all([
      createGroup('section', new FormData()), deleteGroup('section', 'group'),
      addGroupMember('section', 'group', 'member-auth'), removeGroupMember('section', 'group', 'member-auth'),
      createThread('group', 'Title'), postToThread('group', 'thread', 'Reply'), softDeletePost('group', 'post'),
    ])
    expect(results.every(r => r.error === 'Not authenticated')).toBe(true)
  })
  it('requires staff for group and membership administration', async () => {
    mockActor()
    expect(await createGroup('section', new FormData())).toEqual({ error: 'Insufficient privileges' })
    expect(await deleteGroup('section', 'group')).toEqual({ error: 'Insufficient privileges' })
    expect(await addGroupMember('section', 'group', 'member-auth')).toEqual({ error: 'Insufficient privileges' })
    expect(await removeGroupMember('section', 'group', 'member-auth')).toEqual({ error: 'Insufficient privileges' })
  })
  it('rejects a missing profile', async () => {
    mockActor('student', { profiles: { data: null, error: null } })
    expect(await createThread('group', 'Title')).toEqual({ error: 'Profile not found' })
  })
  it('stamps group tenant and Auth creator', async () => {
    const { writes } = mockActor('admin')
    const form = new FormData(); form.set('group_name', ' Group ')
    expect(await createGroup('section', form)).toEqual({})
    expect(writes.section_groups).toMatchObject({ org_id: 'org-a', created_by: 'actor-auth', group_name: 'Group', purpose: 'general' })
  })
  it('validates group name and capacity', async () => {
    mockActor('admin')
    const form = new FormData()
    expect((await createGroup('section', form)).error).toBe('Group name is required')
    form.set('group_name', 'Group'); form.set('max_members', '-1')
    expect((await createGroup('section', form)).error).toMatch('positive whole number')
  })
  it('rejects inaccessible parent sections', async () => {
    mockActor('admin', { course_sections: { data: null, error: null } })
    const form = new FormData(); form.set('group_name', 'Group')
    expect(await createGroup('missing', form)).toEqual({ error: 'Section not found' })
  })
  it('scopes member assignments and stores the Auth ID', async () => {
    const { writes, filters } = mockActor('admin')
    expect(await addGroupMember('section', 'group', 'member-auth')).toEqual({})
    expect(writes.section_group_members).toEqual({ group_id: 'group', user_id: 'member-auth', org_id: 'org-a', role: 'member' })
    expect(filters.profiles).toContainEqual(['org_id', 'org-a'])
  })
  it('rejects missing members', async () => {
    mockActor('admin', { section_groups: { data: null, error: null } })
    expect(await addGroupMember('section', 'missing', 'member-auth')).toEqual({ error: 'Group or member not found' })
  })
  it('scopes staff deletions to their tenant', async () => {
    const { filters } = mockActor('admin')
    expect(await deleteGroup('section', 'group')).toEqual({})
    expect(await removeGroupMember('section', 'group', 'member-auth')).toEqual({})
    expect(filters.section_groups).toContainEqual(['section_id', 'section'])
    expect(filters.section_group_members).toContainEqual(['org_id', 'org-a'])
  })
  it('creates threads with tenant and Auth creator', async () => {
    const { writes } = mockActor()
    expect(await createThread('group', ' Title ')).toEqual({ threadId: 'thread' })
    expect(writes.group_threads).toEqual({ group_id: 'group', org_id: 'org-a', title: 'Title', created_by: 'actor-auth' })
  })
  it('validates thread title and missing group', async () => {
    mockActor('student', { section_groups: { data: null, error: null } })
    expect(await createThread('group', ' ')).toEqual({ error: 'Thread title is required' })
    expect(await createThread('group', 'Title')).toEqual({ error: 'Group not found' })
  })
  it('uses Auth ID for post author and stamps tenant', async () => {
    const { writes, filters } = mockActor()
    expect(await postToThread('group', 'thread', ' Reply ')).toEqual({})
    expect(writes.group_posts).toMatchObject({ author_id: 'actor-auth', org_id: 'org-a', body: 'Reply' })
    expect(filters.group_threads).toContainEqual(['group_id', 'group'])
  })
  it('rejects locked and missing threads', async () => {
    mockActor('student', { group_threads: { data: { is_locked: true }, error: null } })
    expect(await postToThread('group', 'thread', 'Reply')).toEqual({ error: 'This thread is locked' })
    mockActor('student', { group_threads: { data: null, error: null } })
    expect(await postToThread('group', 'thread', 'Reply')).toEqual({ error: 'Thread not found' })
  })
  it('rejects blank replies', async () => {
    mockActor()
    expect(await postToThread('group', 'thread', ' ')).toEqual({ error: 'Reply is required' })
  })
  it('sanitizes database errors', async () => {
    mockActor('student', { group_posts: { data: null, error: { message: 'private database details' } } })
    expect((await postToThread('group', 'thread', 'Reply')).error).toBe('Unable to save group changes. Please try again.')
    expect((await softDeletePost('group', 'post')).error).not.toContain('private')
  })
  it('scopes soft deletion to the Auth author, group and tenant', async () => {
    const { filters } = mockActor()
    expect(await softDeletePost('group', 'post')).toEqual({})
    expect(filters.group_posts).toEqual([['id', 'post'], ['author_id', 'actor-auth'], ['group_id', 'group'], ['org_id', 'org-a']])
  })
})
