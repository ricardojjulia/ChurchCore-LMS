import { describe, it, expect, vi, beforeEach } from 'vitest'
import { adoptLibraryTemplate } from '@/lib/library'
import { adoptTemplate, publishTemplate } from '@/app/actions/library'
import { covers } from '@/tests/covers'

covers(
  'page:/admin/library',
  'action:library.adoptTemplate',
  'action:library.publishTemplate'
)

// Mock utils/supabase/server
const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('COUNCIL-2026-043: Starter Content Library & Course Templates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Adoption Engine (adoptLibraryTemplate)', () => {
    it('successfully adopts a single course template with modules and blocks', async () => {
      const templateData = {
        id: 'tpl-101',
        slug: 'foundations-of-faith',
        title: 'Foundations of Faith',
        description: 'Christian theology basics',
        category: 'discipleship',
        audience: 'all',
        language: 'en',
        license: 'cc-by-nc-4.0',
        attribution: 'ChurchCore Theological Council',
        is_starter_pack: false,
        snapshot: {
          course: {
            title: 'Foundations of Faith',
            description: 'Core doctrines of Christianity',
          },
          modules: [
            {
              title: 'Module 1: Salvation',
              description: 'Understanding grace',
              order_index: 0,
              blocks: [
                {
                  title: 'Lesson 1.1 Grace Alone',
                  type: 'text',
                  content: { body: 'Saved by grace through faith.' },
                  order_index: 0,
                },
              ],
            },
          ],
        },
      }

      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'library_templates') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              single: vi.fn().mockResolvedValue({ data: templateData, error: null }),
            }
          }
          if (table === 'library_adoptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'courses') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'course-new-1', title: 'Foundations of Faith' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'course_blocks') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
          }
        }),
      }

      const result = await adoptLibraryTemplate(mockDb as any, {
        orgId: 'org-abc',
        templateId: 'tpl-101',
        mode: 'copy',
        adminUid: 'admin-1',
      })

      expect(result.success).toBe(true)
      expect(result.courseId).toBe('course-new-1')
      expect(result.coursesCreated).toBe(1)
      expect(result.modulesCreated).toBe(1)
      expect(result.blocksCreated).toBe(2)
    })

    it('successfully adopts a starter pack bundle with multiple courses and learning path', async () => {
      const bundleTemplate = {
        id: 'bundle-001',
        slug: 'discipleship-starter-pack',
        title: 'Discipleship Starter Pack',
        description: 'Comprehensive curriculum bundle',
        category: 'discipleship',
        is_starter_pack: true,
        snapshot: {
          path_title: 'Foundations Discipleship Track',
          path_description: 'Complete new believer pathway',
          bundle_slugs: ['course-part-1', 'course-part-2'],
        },
      }

      const childCourse1 = {
        id: 'child-tpl-1',
        slug: 'course-part-1',
        title: 'Part 1: The Gospel',
        is_starter_pack: false,
        snapshot: {
          course: { title: 'Part 1: The Gospel' },
          modules: [],
        },
      }

      const childCourse2 = {
        id: 'child-tpl-2',
        slug: 'course-part-2',
        title: 'Part 2: The Church',
        is_starter_pack: false,
        snapshot: {
          course: { title: 'Part 2: The Church' },
          modules: [],
        },
      }

      let courseCounter = 0
      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'library_templates') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockImplementation((col: string, val: string) => {
                  let found: any = null
                  if (val === 'bundle-001') found = bundleTemplate
                  else if (val === 'child-tpl-1') found = childCourse1
                  else if (val === 'child-tpl-2') found = childCourse2
                  return {
                    single: vi.fn().mockResolvedValue({ data: found, error: null }),
                  }
                }),
                in: vi.fn().mockResolvedValue({
                  data: [childCourse1, childCourse2],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'library_adoptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          if (table === 'courses') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockImplementation(() => {
                    courseCounter++
                    return Promise.resolve({
                      data: { id: `created-course-${courseCounter}`, title: `Course ${courseCounter}` },
                      error: null,
                    })
                  }),
                }),
              }),
            }
          }
          if (table === 'learning_paths') {
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'path-created-99' },
                    error: null,
                  }),
                }),
              }),
            }
          }
          if (table === 'learning_path_courses') {
            return {
              insert: vi.fn().mockResolvedValue({ error: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnThis(),
          }
        }),
      }

      const result = await adoptLibraryTemplate(mockDb as any, {
        orgId: 'org-abc',
        templateId: 'bundle-001',
        mode: 'copy',
        adminUid: 'admin-1',
      })

      expect(result.success).toBe(true)
      expect(result.pathId).toBe('path-created-99')
      expect(result.coursesCreated).toBe(2)
    })
  })

  describe('Server Actions', () => {
    it('adoptTemplate rejects unauthorized or non-admin users', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } })
      const res1 = await adoptTemplate({ templateId: 'tpl-1' })
      expect(res1.success).toBe(false)
      expect(res1.error).toBe('Unauthorized')

      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-student' } } })
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { uid: 'u1', org_id: 'org1', role: 'student' },
        }),
      })

      const res2 = await adoptTemplate({ templateId: 'tpl-1' })
      expect(res2.success).toBe(false)
      expect(res2.error).toContain('Insufficient permissions')
    })

    it('publishTemplate rejects non-platform_admin users', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-admin' } } })
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin' },
        }),
      })

      const res = await publishTemplate({
        slug: 'test-course',
        title: 'Test',
        category: 'theology',
        snapshot: {},
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('Only platform administrators')
    })

    it('publishTemplate upserts template for platform_admin', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-superadmin' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { role: 'platform_admin' } }),
          }
        }
        if (table === 'library_templates') {
          return {
            upsert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { id: 'new-tpl-id' }, error: null }),
              }),
            }),
          }
        }
        return {}
      })

      const res = await publishTemplate({
        slug: 'catechism-basics',
        title: 'Catechism Basics',
        category: 'theology',
        snapshot: { course: { title: 'Catechism Basics' } },
      })

      expect(res.success).toBe(true)
      expect(res.templateId).toBe('new-tpl-id')
    })
  })
})
