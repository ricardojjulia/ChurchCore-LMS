// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitH5PProgress } from '@/app/actions/learning'

const state = vi.hoisted(() => ({
  user: { id: 'auth-student-1' } as { id: string } | null,
  profile: { uid: 'profile-123' } as { uid: string } | null,
  block: {
    id: 'block-h5p-1',
    course_id: 'course-1',
    gamification: { base_xp_reward: 50 },
    content: {
      passing_score_pct: 70,
      require_passing: true,
      url: 'https://h5p.org/h5p/embed/123',
    },
  },
  submissions: [] as Array<Record<string, unknown>>,
  awardedXp: [] as Array<{ uid: string; amount: number }>,
}))

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
    },
    from: (table: string) => {
      const q: any = {
        select: () => q,
        eq: () => q,
        single: async () => {
          if (table === 'profiles') return { data: state.profile }
          if (table === 'course_blocks') return { data: state.block }
          return { data: null }
        },
        insert: (row: Record<string, unknown>) => {
          state.submissions.push(row)
          return { error: null }
        },
      }
      return q
    },
  }),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: async (fn: string, args: any) => {
      if (fn === 'award_xp') {
        state.awardedXp.push({ uid: args.p_uid, amount: args.p_amount })
        return { data: { new_xp: 50, new_level: 1, leveled_up: false, prev_level: 1 } }
      }
      return { data: null }
    },
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('submitH5PProgress', () => {
  beforeEach(() => {
    state.submissions = []
    state.awardedXp = []
    state.user = { id: 'auth-student-1' }
    state.profile = { uid: 'profile-123' }
  })

  it('records passing grade, awards XP, and marks status as graded when score meets requirement', async () => {
    const result = await submitH5PProgress({
      blockId: 'block-h5p-1',
      score: 85,
      maxScore: 100,
      completionStatus: 'passed',
      xApiStatement: { verb: { id: 'http://adlnet.gov/expapi/verbs/passed' } },
    })

    expect(result.gradePct).toBe(85)
    expect(result.xpAwarded).toBe(50)
    expect(state.submissions).toHaveLength(1)
    expect(state.submissions[0].status).toBe('graded')
    expect(state.submissions[0].score).toBe(85)
    expect(state.submissions[0].max_score).toBe(100)
    expect(state.submissions[0].grade_pct).toBe(85)
    expect(state.awardedXp).toEqual([{ uid: 'profile-123', amount: 50 }])
  })

  it('marks status as submitted and does not award XP when score is below passing requirement', async () => {
    const result = await submitH5PProgress({
      blockId: 'block-h5p-1',
      score: 50,
      maxScore: 100,
      completionStatus: 'failed',
    })

    expect(result.gradePct).toBe(50)
    expect(result.xpAwarded).toBe(0)
    expect(state.submissions).toHaveLength(1)
    expect(state.submissions[0].status).toBe('submitted')
    expect(state.submissions[0].grade_pct).toBe(50)
    expect(state.awardedXp).toHaveLength(0)
  })

  it('returns error when not authenticated', async () => {
    state.user = null
    const result = await submitH5PProgress({
      blockId: 'block-h5p-1',
      score: 100,
      maxScore: 100,
    })

    expect(result.error).toBe('Not authenticated')
  })
})
