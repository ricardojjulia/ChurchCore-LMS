// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import {
  getPrebuiltRubricTemplates,
  saveBlockRubric,
  gradeWithRubric,
} from './rubrics'
import { covers } from '../../../tests/playwright/fixtures/covers'

covers(
  'action:rubrics.getPrebuiltRubricTemplates',
  'action:rubrics.saveBlockRubric',
  'action:rubrics.gradeWithRubric',
)

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'course_blocks') {
        const query: any = {
          select: () => query,
          eq: () => query,
          single: vi.fn(async () => ({
            data: {
              id: 'block-1',
              content: {},
              courses: { org_id: 'org-1', owner_id: 'teacher-1' },
            },
            error: null,
          })),
        }
        return query
      }

      if (table === 'block_submissions') {
        const query: any = {
          select: () => query,
          eq: () => query,
          single: vi.fn(async () => ({
            data: {
              id: 'sub-1',
              block_id: 'block-1',
              user_id: 'student-1',
              max_score: 100,
              org_id: 'org-1',
              content: {},
              course_blocks: {
                courses: { org_id: 'org-1', owner_id: 'teacher-1' },
              },
            },
            error: null,
          })),
        }
        return query
      }

      const fallbackQuery: any = {
        insert: vi.fn().mockImplementation(() => fallbackQuery),
        update: vi.fn().mockImplementation(() => fallbackQuery),
        select: vi.fn().mockImplementation(() => fallbackQuery),
        eq: vi.fn().mockImplementation(() => fallbackQuery),
        throwOnError: vi.fn().mockImplementation(() => fallbackQuery),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
      }
      return fallbackQuery
    }),
  })),
}))

function authClient(role = 'teacher', uid = 'teacher-1', orgId = 'org-1') {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-1' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation(() => {
      const query: any = {
        select: () => query,
        eq: () => query,
        single: vi.fn(async () => ({
          data: { uid, role, org_id: orgId },
          error: null,
        })),
        update: vi.fn(() => query),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
      }
      return query
    }),
  }
}

describe('Assignment Rubrics Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getPrebuiltRubricTemplates', () => {
    it('returns standard theological and expository rubric templates', async () => {
      const templates = await getPrebuiltRubricTemplates()
      expect(templates.length).toBeGreaterThanOrEqual(2)
      expect(templates[0].title).toContain('Exegesis')
      expect(templates[1].title).toContain('Sermon')
      expect(templates[0].criteria.length).toBeGreaterThan(0)
    })
  })

  describe('saveBlockRubric', () => {
    it('throws when unauthenticated', async () => {
      vi.mocked(createClient).mockResolvedValueOnce({
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      } as any)

      await expect(
        saveBlockRubric({
          blockId: 'block-1',
          rubric: { title: 'Test', criteria: [] },
        })
      ).rejects.toThrow()
    })

    it('rejects rubrics without criteria', async () => {
      vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)

      const res = await saveBlockRubric({
        blockId: 'block-1',
        rubric: { title: 'Test', criteria: [] },
      })
      expect(res.error).toContain('at least one criterion')
    })

    it('successfully saves a valid rubric for course instructor', async () => {
      vi.mocked(createClient).mockResolvedValueOnce(authClient('teacher', 'teacher-1') as any)

      const res = await saveBlockRubric({
        blockId: 'block-1',
        rubric: {
          title: 'Homiletics Rubric',
          criteria: [
            {
              id: 'c1',
              title: 'Structure',
              levels: [{ id: 'l1', label: 'Good', points: 10, description: 'Clear' }],
            },
          ],
        },
      })
      expect(res.error).toBeUndefined()
    })
  })

  describe('gradeWithRubric', () => {
    it('throws when student attempts to grade with rubric', async () => {
      vi.mocked(createClient).mockResolvedValueOnce(authClient('student', 'student-1') as any)

      await expect(
        gradeWithRubric({
          submissionId: 'sub-1',
          evaluations: [{ criterionId: 'c1', levelId: 'l1', points: 25 }],
        })
      ).rejects.toThrow()
    })

    it('rejects empty evaluations list', async () => {
      vi.mocked(createClient).mockResolvedValueOnce(authClient('teacher', 'teacher-1') as any)

      const res = await gradeWithRubric({
        submissionId: 'sub-1',
        evaluations: [],
      })
      expect(res.error).toContain('score at least one rubric criterion')
    })

    it('correctly calculates total score and saves rubric evaluation', async () => {
      vi.mocked(createClient).mockResolvedValueOnce(authClient('teacher', 'teacher-1') as any)

      const res = await gradeWithRubric({
        submissionId: 'sub-1',
        evaluations: [
          { criterionId: 'c1', levelId: 'l1', points: 25 },
          { criterionId: 'c2', levelId: 'l2', points: 20 },
        ],
        overallFeedback: 'Well structured and grounded.',
      })

      expect(res.totalScore).toBe(45)
      expect(res.error).toBeUndefined()
    })
  })
})
