// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../tests/covers'

covers(
  'action:learning.createCourseFromOutline',
  'action:learning.deleteCourseModule',
  'action:learning.deleteCourseBlock',
  'action:learning.addCourseModule',
  'action:learning.saveCourseBlock',
)

const m = vi.hoisted(() => ({
  role: 'teacher',
  callerOrg: 'org-a',
  courseOrg: 'org-a' as string | null,
  inserted: [] as Array<Record<string, unknown>>,
  deleted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
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
    from: () => {
      const q: any = {
        insert: (rows: Array<Record<string, unknown>> | Record<string, unknown>) => {
          if (Array.isArray(rows)) m.inserted.push(...rows)
          else m.inserted.push(rows)
          return q
        },
        delete: () => {
          m.deleted.push({ time: Date.now() })
          return q
        },
        update: (payload: Record<string, unknown>) => {
          m.updated.push(payload)
          return q
        },
        eq: () => q,
        select: () => q,
        single: async () => ({ data: { id: 'b-new-1', ...m.inserted[m.inserted.length - 1] }, error: null }),
        then: (resolve: (v: any) => void) => Promise.resolve({ error: null }).then(resolve),
      }
      return q
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

import {
  createCourseFromOutline,
  deleteCourseModule,
  deleteCourseBlock,
  addCourseModule,
  saveCourseBlock,
} from './learning'

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
  m.role = 'teacher'; m.callerOrg = 'org-a'; m.courseOrg = 'org-a'
  m.inserted = []; m.deleted = []; m.updated = []
})

describe('createCourseFromOutline', () => {
  it('creates module headers and child blocks in the caller’s org with populated content', async () => {
    const richOutline = {
      modules: [
        {
          title: 'Week 1',
          blocks: [
            {
              title: 'Intro',
              type: 'page',
              objective: 'Welcome',
              content: { body: '<p>Complete lesson content</p>' },
            },
            {
              title: 'Check',
              type: 'quiz',
              objective: 'Recall',
              content: {
                questions: [
                  { text: 'Question 1', options: ['A', 'B'], correct_index: 0, points: 10 },
                ],
              },
            },
            {
              title: 'Activity',
              type: 'assignment',
              objective: 'Deliver essay',
              content: { instructions: 'Submit a 500 word paper', max_points: 100 },
            },
          ],
        },
        {
          title: 'Week 2',
          blocks: [
            {
              title: 'Talk',
              type: 'discussion',
              objective: 'Share',
              content: { prompt: 'What is your testimony?' },
            },
          ],
        },
      ],
    }

    const res = await createCourseFromOutline({ courseId: 'c-1', outline: richOutline as never })
    expect(res).toEqual({ blocksCreated: 6 })
    const modules = m.inserted.filter((r) => r.block_type_id === 'module_header')
    expect(modules.map((r) => r.title)).toEqual(['Week 1', 'Week 2'])
    const children = m.inserted.filter((r) => r.block_type_id !== 'module_header')
    expect(children.map((r) => r.block_type_id)).toEqual(['page', 'quiz', 'assignment', 'discussion'])
    expect(children.every((r) => modules.some((mod) => mod.id === r.parent_block_id))).toBe(true)
    expect(m.inserted.every((r) => r.org_id === 'org-a' && r.course_id === 'c-1')).toBe(true)

    // Verify rich content is populated
    const pageBlock = children.find((c) => c.block_type_id === 'page')
    expect((pageBlock?.content as any)?.body).toBe('<p>Complete lesson content</p>')

    const quizBlock = children.find((c) => c.block_type_id === 'quiz')
    expect((quizBlock?.content as any)?.questions).toHaveLength(1)

    const assignBlock = children.find((c) => c.block_type_id === 'assignment')
    expect((assignBlock?.content as any)?.instructions).toBe('Submit a 500 word paper')

    const discBlock = children.find((c) => c.block_type_id === 'discussion')
    expect((discBlock?.content as any)?.prompt).toBe('What is your testimony?')
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

describe('deleteCourseModule & deleteCourseBlock', () => {
  it('deletes a course module and cascaded children via service client', async () => {
    const res = await deleteCourseModule({ courseId: 'c-1', moduleId: 'mod-1' })
    expect(res).toEqual({})
    expect(m.deleted.length).toBeGreaterThanOrEqual(1)
  })

  it('deletes a single course block', async () => {
    const res = await deleteCourseBlock({ courseId: 'c-1', blockId: 'b-1' })
    expect(res).toEqual({})
    expect(m.deleted.length).toBeGreaterThanOrEqual(1)
  })

  it('refuses module deletion for unauthorized roles', async () => {
    m.role = 'student'
    const res = await deleteCourseModule({ courseId: 'c-1', moduleId: 'mod-1' })
    expect(res).toEqual({ error: 'Unauthorized' })
  })
})

describe('addCourseModule & saveCourseBlock', () => {
  it('adds a course module', async () => {
    const res = await addCourseModule({ courseId: 'c-1', title: 'New Module', sortOrder: 1000 })
    expect(res.data).toBeDefined()
    expect(res.error).toBeUndefined()
  })

  it('saves and updates a course block', async () => {
    const res = await saveCourseBlock({
      courseId: 'c-1',
      blockTypeId: 'page',
      title: 'New Page',
      content: { body: '<p>Content</p>' },
    })
    expect(res.data).toBeDefined()
    expect(res.error).toBeUndefined()
  })
})
