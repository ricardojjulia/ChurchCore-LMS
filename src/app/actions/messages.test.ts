import { vi, describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@/utils/supabase/server'
import { sendMessage, deleteMessage, markThreadRead, getOrCreateDirectThread } from './messages'

// ── Service client mock (used by sendMessage and getOrCreateDirectThread) ─────
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select:  vi.fn().mockReturnThis(),
      insert:  vi.fn().mockResolvedValue({ data: null, error: null }),
      update:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      neq:     vi.fn().mockReturnThis(),
      is:      vi.fn().mockReturnThis(),
      in:      vi.fn().mockReturnThis(),
      order:   vi.fn().mockReturnThis(),
      limit:   vi.fn().mockReturnThis(),
      single:  vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
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

  it('surfaces DB error message on update failure', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      authClient({
        messages: { data: null, error: { message: 'not found or not owned' } },
      }) as any,
    )

    const result = await deleteMessage('msg-1')
    expect(result).toEqual({ error: 'not found or not owned' })
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
