import { describe, it, expect, vi, beforeEach } from 'vitest'
import { submitScormCommit } from '@/app/actions/scorm'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('SCORM Runtime Server Action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated users', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await submitScormCommit({
      blockId: 'block-1',
      version: '1.2',
      cmiData: {},
    })
    expect(result).toEqual({ error: 'Unauthorized' })
  })

  it('saves in-progress attempt without awarding XP or completing block', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })
    
    // profiles
    const selectProfile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { uid: 'user-1', org_id: 'org-1' } }),
    }

    // course_blocks
    const selectBlock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'block-1',
          course_id: 'course-1',
          org_id: 'org-1',
          gamification: { base_xp_reward: 75 },
          content: {},
        },
      }),
    }

    // scorm_attempts upsert
    const upsertAttempts = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return selectProfile
      if (table === 'course_blocks') return selectBlock
      if (table === 'scorm_attempts') return upsertAttempts
      return {}
    })

    const result = await submitScormCommit({
      blockId: 'block-1',
      version: '1.2',
      lessonStatus: 'incomplete',
      sessionTime: '00:02:15',
      suspendData: 'slide=4',
      cmiData: { 'cmi.core.lesson_status': 'incomplete' },
    })

    expect(result).toEqual({
      success: true,
      status: 'incomplete',
      isFinished: false,
      xpAwarded: 0,
    })
    expect(upsertAttempts.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        block_id: 'block-1',
        user_id: 'user-1',
        status: 'incomplete',
        suspend_data: 'slide=4',
      }),
      { onConflict: 'block_id,user_id' }
    )
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('completes block, awards XP, and records gradebook submission when passed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'auth-1' } } })

    const selectProfile = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { uid: 'user-1', org_id: 'org-1' } }),
    }

    const selectBlock = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'block-1',
          course_id: 'course-1',
          org_id: 'org-1',
          gamification: { base_xp_reward: 100 },
          content: {},
        },
      }),
    }

    const upsertAttempts = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }

    const upsertSubmissions = {
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'sub-1' }], error: null }),
      }),
    }

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return selectProfile
      if (table === 'course_blocks') return selectBlock
      if (table === 'scorm_attempts') return upsertAttempts
      if (table === 'block_submissions') return upsertSubmissions
      return {}
    })

    mockRpc.mockResolvedValue({ data: true, error: null })

    const result = await submitScormCommit({
      blockId: 'block-1',
      version: '2004',
      lessonStatus: 'passed',
      scoreScaled: 0.95,
      scoreRaw: 95,
      scoreMax: 100,
      cmiData: { 'cmi.completion_status': 'completed', 'cmi.success_status': 'passed' },
    })

    expect(result).toEqual({
      success: true,
      status: 'passed',
      isFinished: true,
      xpAwarded: 100,
    })
    expect(mockRpc).toHaveBeenCalledWith('record_engagement_event', {
      p_event_type: 'block_completion',
      p_source_type: 'block',
      p_source_id: 'block-1',
      p_metadata: {
        score: 95,
        scaled: 0.95,
        scorm_status: 'passed',
      },
    })
    expect(upsertSubmissions.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        block_id: 'block-1',
        user_id: 'user-1',
        grade_pct: 95,
        status: 'graded',
      }),
      { onConflict: 'block_id,user_id' }
    )
  })
})
