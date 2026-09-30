import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import {
  sendMessage,
  deleteMessage,
  markThreadRead,
  getOrCreateDirectThread,
  getOrCreateGuardianThread,
  sendGuardianTeacherMessage,
  searchUsers,
} from './messages'
import { createServiceClient } from '@/utils/supabase/service'
import { covers } from '../../tests/covers'

covers(
  'action:messages.sendMessage',
  'action:messages.deleteMessage',
  'action:messages.markThreadRead',
  'action:messages.getOrCreateDirectThread',
  'action:messages.getOrCreateGuardianThread',
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

// ── getOrCreateGuardianThread (COUNCIL-2026-035) ─────────────────────────────

// A service client whose every query chain resolves to a per-table value, and
// which records inserts.
function serviceWith(results: Record<string, Record<string, unknown>>, inserts: Array<{ table: string; rows: unknown }>) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      const chain = resolvesWith(results[table] ?? { data: null, error: null }) as Record<string, unknown>
      return new Proxy(chain, {
        get(target, prop) {
          if (prop === 'insert') {
            return (rows: unknown) => { inserts.push({ table, rows }); return resolvesWith(results[`${table}:insert`] ?? { data: null, error: null }) }
          }
          return Reflect.get(target, prop)
        },
      })
    }),
  }
}

describe('getOrCreateGuardianThread', () => {
  const guardian = { data: { uid: 'g-1', display_name: 'Grace Guardian', role: 'guardian', org_id: 'org-a' }, error: null }

  it('refuses a pair the database does not allow', async () => {
    const client = authClient({ profiles: guardian })
    client.rpc = vi.fn().mockResolvedValue({ data: false, error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const res = await getOrCreateGuardianThread('student-1', 'teacher-9', 'Hello')
    expect(res.error).toMatch(/can’t message/)
    expect(client.rpc).toHaveBeenCalledWith('can_message_about', { p_student_uid: 'student-1', p_other_uid: 'teacher-9' })
  })

  it('rejects an empty message before any lookup', async () => {
    const client = authClient({ profiles: guardian })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    expect(await getOrCreateGuardianThread('student-1', 'teacher-1', '  <b></b> ')).toEqual({ error: 'Message cannot be empty.' })
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('opens a thread about the student, sends as the caller and queues no message text for email', async () => {
    const client = authClient({ profiles: guardian, messages: { count: 0, data: null, error: null } })
    client.rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    const inserts: Array<{ table: string; rows: unknown }> = []
    vi.mocked(createServiceClient).mockReturnValueOnce(serviceWith({
      message_thread_participants: { data: [], error: null },
      'message_threads:insert': { data: { id: 'thread-1' }, error: null },
      message_threads: { data: { subject_student_uid: 'student-1' }, error: null },
      profiles: { data: [], error: null },
    }, inserts) as any)

    const res = await getOrCreateGuardianThread('student-1', 'teacher-1', 'How is she doing?')
    expect(res).toEqual({ threadId: 'thread-1' })
    const thread = inserts.find((i) => i.table === 'message_threads')?.rows as Record<string, unknown>
    expect(thread).toMatchObject({ subject_student_uid: 'student-1', created_by: 'g-1', org_id: 'org-a' })
    const people = inserts.find((i) => i.table === 'message_thread_participants')?.rows as Array<{ user_id: string }>
    expect(people.map((p) => p.user_id)).toEqual(['g-1', 'teacher-1'])
    // The message itself is inserted by the caller's client (RLS applies), not the service role.
    expect(inserts.some((i) => i.table === 'messages')).toBe(false)
    expect(client.from).toHaveBeenCalledWith('messages')
  })
})

describe('searchUsers', () => {
  it('quotes the search term so it cannot add filter conditions', async () => {
    const orArgs: string[] = []
    const client = authClient()
    client.from = vi.fn().mockImplementation((table: string) => {
      if (table !== 'profiles') return resolvesWith({ data: null, error: null })
      const chain: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'neq', 'limit']) chain[k] = () => chain
      chain.single = async () => ({ data: { uid: 'p-001', display_name: 'Me', role: 'teacher', org_id: 'org-a' }, error: null })
      chain.or = (arg: string) => { orArgs.push(arg); return chain }
      chain.then = (res: (v: unknown) => void) => res({ data: [], error: null })
      return chain
    })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await searchUsers('a,b)or(role.eq.admin')
    expect(orArgs).toEqual(['display_name.ilike."%a,b)or(role.eq.admin%",email.ilike."%a,b)or(role.eq.admin%"'])
  })

  it('escapes LIKE wildcards and quote characters in two layers', async () => {
    const orArgs: string[] = []
    const client = authClient()
    client.from = vi.fn().mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      for (const k of ['select', 'eq', 'neq', 'limit']) chain[k] = () => chain
      chain.single = async () => ({ data: { uid: 'p-001', display_name: 'Me', role: 'teacher', org_id: 'org-a' }, error: null })
      chain.or = (arg: string) => { orArgs.push(arg); return chain }
      chain.then = (res: (v: unknown) => void) => res({ data: [], error: null })
      return chain
    })
    vi.mocked(createClient).mockResolvedValueOnce(client as any)
    await searchUsers('50%_"x')
    // % → \% (LIKE), then every backslash and quote escaped again for PostgREST.
    expect(orArgs[0]).toBe('display_name.ilike."%50\\\\%\\\\_\\"x%",email.ilike."%50\\\\%\\\\_\\"x%"')
  })
})
