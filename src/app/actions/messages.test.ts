import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import {
  sendMessage,
  deleteMessage,
  markThreadRead,
  getOrCreateDirectThread,
  sendGuardianTeacherMessage,
  searchUsers,
} from './messages'
import { covers } from '../../tests/covers'

covers(
  'action:messages.sendMessage',
  'action:messages.deleteMessage',
  'action:messages.markThreadRead',
  'action:messages.getOrCreateDirectThread',
  'action:messages.sendGuardianTeacherMessage',
  'action:messages.searchUsers',
)

// ── Service client mock (used by sendMessage and getOrCreateDirectThread) ─────
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => {
    const query: any = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation(() => query),
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      neq:    vi.fn().mockReturnThis(),
      is:     vi.fn().mockReturnThis(),
      in:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockReturnThis(),
      limit:  vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'thread-123' }, error: null }),
      then:   (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
    }
    return {
      from: vi.fn().mockReturnValue(query),
      rpc:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  }),
}))

// ── Proxy: any query chain awaitable with a fixed resolved value ───────────────
function resolvesWith(value: Record<string, unknown>) {
  const handler: ProxyHandler<object> = {
    get(_, prop) {
      if (prop === 'then') {
        return (res: (v: unknown) => void) => Promise.resolve(value).then(res)
      }
      if (typeof prop === 'symbol') return undefined
      return (..._args: unknown[]) => new Proxy({}, handler)
    },
  }
  return new Proxy({}, handler)
}

// ── Factory: authenticated supabase client mock ───────────────────────────────
function authClient(tableResults: Record<string, Record<string, unknown>> = {}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-u-001' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) =>
      resolvesWith(
        tableResults[table] ??
        (table === 'profiles'
          ? { data: { uid: 'p-001', display_name: 'Test User', role: 'student' }, error: null }
          : { data: null, error: null }),
      ),
    ),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('throws when caller is not authenticated (requireAuth throws Unauthenticated)', async () => {
    // setup.ts default mock: getUser returns null → requireAuth throws
    await expect(sendMessage('thread-1', 'hello')).rejects.toThrow()
  })

  it('returns error when body is empty after stripping HTML', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        message_thread_participants: { data: { can_reply: true, left_at: null }, error: null },
      }) as any,
    )

    const result = await sendMessage('thread-1', '   ')
    expect(result).toEqual({ error: 'Message cannot be empty.' })
  })

  it('returns error when caller is not a participant in the thread', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        message_thread_participants: { data: null, error: null }, // null participant
      }) as any,
    )

    const result = await sendMessage('thread-1', 'hello there')
    expect(result).toEqual({ error: 'You are not in this conversation.' })
  })

  it('returns error when participant cannot reply', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        message_thread_participants: { data: { can_reply: false, left_at: null }, error: null },
      }) as any,
    )

    const result = await sendMessage('thread-1', 'hello')
    expect(result).toEqual({ error: 'You cannot reply in this thread.' })
  })
})

// ── deleteMessage ─────────────────────────────────────────────────────────────

describe('deleteMessage', () => {
  it('throws when caller is not authenticated', async () => {
    await expect(deleteMessage('msg-1')).rejects.toThrow()
  })

  it('happy path — returns {} on success', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)

    const result = await deleteMessage('msg-1')
    expect(result).toEqual({})
  })

  it('returns a generic error (never the raw DB message) on update failure', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        messages: { data: null, error: { message: 'not found or not owned' } },
      }) as any,
    )

    const result = await deleteMessage('msg-1')
    expect(result).toEqual({ error: 'Could not complete that. Please try again.' })
  })
})

// ── markThreadRead ────────────────────────────────────────────────────────────

describe('markThreadRead', () => {
  it('throws when caller is not authenticated', async () => {
    await expect(markThreadRead('thread-1')).rejects.toThrow()
  })

  it('completes without throwing when authenticated', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)
    await expect(markThreadRead('thread-1')).resolves.not.toThrow()
  })
})

// ── getOrCreateDirectThread ───────────────────────────────────────────────────

describe('getOrCreateDirectThread', () => {
  it('throws when caller is not authenticated', async () => {
    await expect(getOrCreateDirectThread('uid-2', 'hello')).rejects.toThrow()
  })

  it('returns error when recipientUid is empty', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)

    const result = await getOrCreateDirectThread('', 'hello')
    expect(result).toEqual({ error: 'Recipient is required.' })
  })

  it('returns error when user tries to message themselves', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)

    // profile.uid is 'p-001' from the default authClient mock
    const result = await getOrCreateDirectThread('p-001', 'hello')
    expect(result).toEqual({ error: 'Cannot message yourself.' })
  })

  it('returns error when first message body is empty', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        profiles: { data: { uid: 'p-001', display_name: 'Test', role: 'student' }, error: null },
      }) as any,
    )

    const result = await getOrCreateDirectThread('other-uid', '   ')
    expect(result).toEqual({ error: 'Message cannot be empty.' })
  })
})

// ── searchUsers ─────────────────────────────────────────────────────────────

describe('searchUsers', () => {
  it('returns empty array if query is too short', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(authClient() as any)
    const result = await searchUsers('a')
    expect(result).toEqual([])
  })

  it('searches users when query length >= 2', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        profiles: { data: [{ uid: 'p-002', display_name: 'Jane Doe', role: 'teacher' }], error: null },
      }) as any,
    )
    const result = await searchUsers('Jane')
    expect(result).toHaveLength(1)
    expect(result[0].display_name).toBe('Jane Doe')
  })
})

// ── sendGuardianTeacherMessage ───────────────────────────────────────────────

describe('sendGuardianTeacherMessage', () => {
  it('throws when unauthenticated', async () => {
    await expect(sendGuardianTeacherMessage({
      studentUid: 'student-1',
      courseId:   'course-1',
      message:    'hello',
    })).rejects.toThrow()
  })

  it('rejects if caller is not a guardian', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        profiles: { data: { uid: 'p-001', display_name: 'Test', role: 'student' }, error: null },
      }) as any,
    )

    const result = await sendGuardianTeacherMessage({
      studentUid: 'student-1',
      courseId:   'course-1',
      message:    'hello',
    })
    expect(result.error).toContain('Only guardians can initiate student inquiries')
  })

  it('rejects if guardian is not linked to the student', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        profiles: { data: { uid: 'g-001', display_name: 'Guardian User', role: 'guardian' }, error: null },
        guardian_links: { data: null, error: null },
      }) as any,
    )

    const result = await sendGuardianTeacherMessage({
      studentUid: 'student-1',
      courseId:   'course-1',
      message:    'hello',
    })
    expect(result.error).toContain('not authorized as a guardian')
  })

  it('rejects if student is not enrolled in the course', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        profiles: { data: { uid: 'g-001', display_name: 'Guardian User', role: 'guardian' }, error: null },
        guardian_links: { data: { student_uid: 'student-1' }, error: null },
        enrollments: { data: null, error: null },
      }) as any,
    )

    const result = await sendGuardianTeacherMessage({
      studentUid: 'student-1',
      courseId:   'course-1',
      message:    'hello',
    })
    expect(result.error).toContain('Student is not enrolled in this course')
  })

  it('successfully creates thread with course instructor', async () => {
    vi.mocked(createClient).mockReturnValue(
      Promise.resolve(authClient({
        profiles: { data: { uid: 'g-001', display_name: 'Guardian User', role: 'guardian', org_id: 'org-1' }, error: null },
        guardian_links: { data: { student_uid: 'student-1' }, error: null },
        enrollments: { data: { course_id: 'course-1' }, error: null },
        courses: { data: { id: 'course-1', title: 'OT Survey', owner_id: 'teacher-1' }, error: null },
      })) as any,
    )

    const result = await sendGuardianTeacherMessage({
      studentUid: 'student-1',
      courseId:   'course-1',
      message:    'How is my student doing on quizzes?',
    })
    expect(result.error).toBeUndefined()
  })
})
