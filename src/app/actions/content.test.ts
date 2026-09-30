// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '@/tests/covers'

covers(
  'action:content.archivePage',
  'action:content.createPageWithContent',
)

const m = vi.hoisted(() => ({
  role: 'teacher',
  callerUid: 'u-teacher',
  callerOrg: 'org-1',
  courseOrg: 'org-1' as string | null,
  inserted: [] as Array<Record<string, unknown>>,
  updated: [] as Array<Record<string, unknown>>,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'auth-teacher' } },
      }),
    },
    from: (table: string) => {
      const q: any = {
        select: (fields?: string) => {
          if (fields === 'org_id') {
            return {
              eq: () => ({
                single: async () => ({
                  data: m.courseOrg ? { org_id: m.courseOrg } : null,
                  error: m.courseOrg ? null : { message: 'Course not found' },
                }),
              }),
            }
          }
          if (fields === 'id') {
            return {
              single: async () => ({ data: { id: 'page-new-1' }, error: null }),
            }
          }
          return q
        },
        eq: () => ({
          single: async () => ({
            data: { uid: m.callerUid, role: m.role },
            error: null,
          }),
          update: (data: any) => {
            m.updated.push({ table, data })
            return { error: null }
          },
        }),
        insert: (data: any) => {
          m.inserted.push(data)
          return q
        },
        update: (data: any) => {
          m.updated.push({ table, data })
          return {
            eq: () => Promise.resolve({ error: null }),
          }
        },
      }
      return q
    },
  }),
}))

import { createPageWithContent, archivePage } from './content'

beforeEach(() => {
  m.role = 'teacher'
  m.callerUid = 'u-teacher'
  m.callerOrg = 'org-1'
  m.courseOrg = 'org-1'
  m.inserted = []
  m.updated = []
})

describe('content server actions', () => {
  it('creates a new page with custom title and body', async () => {
    const res = await createPageWithContent('course-1', 'Grief Counseling', { type: 'doc', content: [] })
    expect(res.id).toBe('page-new-1')
    expect(m.inserted).toHaveLength(1)
    expect(m.inserted[0].title).toBe('Grief Counseling')
    expect(m.inserted[0].course_id).toBe('course-1')
  })

  it('archives a page cleanly', async () => {
    const res = await archivePage('page-1', 'course-1')
    expect(res.error).toBeUndefined()
    expect(m.updated).toHaveLength(1)
    expect(m.updated[0].data).toEqual({ status: 'archived' })
  })
})
