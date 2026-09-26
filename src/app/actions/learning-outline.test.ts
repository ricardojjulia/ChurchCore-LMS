// @vitest-environment node
// createCourseFromOutline turns an AI-generated outline into course blocks.
// The AI step itself cannot run in the suite (no provider key), so the action
// is tested directly: staff-only, same-org course only, size-capped, and it
// writes module headers with child blocks linked by parent_block_id.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../tests/covers'

covers('action:learning.createCourseFromOutline')

const m = vi.hoisted(() => ({
  role: 'teacher',
  callerOrg: 'org-a',
  courseOrg: 'org-a' as string | null,
  inserted: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'auth-1' } } }) },
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        single: async () => table === 'profile_roles'
          ? { data: { uid: 'u-1', role: m.role, org_id: m.callerOrg } }
          : { data: m.courseOrg ? { org_id: m.courseOrg } : null },
      }
      return q
    },
  }),
}))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({ insert: async (rows: Array<Record<string, unknown>>) => { m.inserted.push(...rows); return { error: null } } }),
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import { createCourseFromOutline } from './learning'

const outline = {
  modules: [
    { title: 'Week 1', blocks: [
      { title: 'Intro', type: 'page', objective: 'Welcome' },
      { title: 'Check', type: 'quiz', objective: 'Recall' },
    ] },
    { title: 'Week 2', blocks: [{ title: 'Talk', type: 'discussion', objective: 'Share' }] },
  ],
}

beforeEach(() => {
  m.role = 'teacher'; m.callerOrg = 'org-a'; m.courseOrg = 'org-a'; m.inserted = []
})

describe('createCourseFromOutline', () => {
  it('creates module headers and child blocks in the caller’s org', async () => {
    const res = await createCourseFromOutline({ courseId: 'c-1', outline: outline as never })
    expect(res).toEqual({ blocksCreated: 5 })
    const modules = m.inserted.filter((r) => r.block_type_id === 'module_header')
    expect(modules.map((r) => r.title)).toEqual(['Week 1', 'Week 2'])
    const children = m.inserted.filter((r) => r.block_type_id !== 'module_header')
    expect(children.map((r) => r.block_type_id)).toEqual(['page', 'quiz', 'discussion'])
    expect(children.every((r) => modules.some((mod) => mod.id === r.parent_block_id))).toBe(true)
    expect(m.inserted.every((r) => r.org_id === 'org-a' && r.course_id === 'c-1')).toBe(true)
  })

  it('refuses a course in another org', async () => {
    m.courseOrg = 'org-b'
    expect(await createCourseFromOutline({ courseId: 'c-1', outline: outline as never })).toEqual({ error: 'Not found' })
    expect(m.inserted).toHaveLength(0)
  })

  it('refuses non-staff', async () => {
    m.role = 'student'
    expect(await createCourseFromOutline({ courseId: 'c-1', outline: outline as never })).toEqual({ error: 'Unauthorized' })
  })

  it('caps outlines at 50 blocks', async () => {
    const big = { modules: [{ title: 'M', blocks: Array.from({ length: 50 }, (_, i) => ({ title: `b${i}`, type: 'page', objective: '' })) }] }
    expect(await createCourseFromOutline({ courseId: 'c-1', outline: big as never })).toEqual({ error: 'Outline too large — maximum 50 blocks.' })
  })
})
