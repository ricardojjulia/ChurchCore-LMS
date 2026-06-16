import { vi } from 'vitest'

// Chainable query builder mock — each method returns `this` for chaining
const queryBuilder = {
  select:  vi.fn(),
  insert:  vi.fn(),
  update:  vi.fn(),
  delete:  vi.fn(),
  upsert:  vi.fn(),
  eq:      vi.fn(),
  neq:     vi.fn(),
  gt:      vi.fn(),
  lt:      vi.fn(),
  gte:     vi.fn(),
  lte:     vi.fn(),
  or:      vi.fn(),
  in:      vi.fn(),
  is:      vi.fn(),
  ilike:   vi.fn(),
  order:   vi.fn(),
  limit:   vi.fn(),
  single:  vi.fn().mockResolvedValue({ data: null, error: null }),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
}

// Wire up chaining — every method returns the builder itself
for (const key of Object.keys(queryBuilder)) {
  if (key !== 'single' && key !== 'maybeSingle') {
    ;(queryBuilder as Record<string, unknown>)[key] = vi
      .fn()
      .mockReturnValue(queryBuilder)
  }
}

// Default resolved value for the builder itself (awaiting a query)
Object.assign(queryBuilder, {
  then: undefined, // not a Promise by default — callers await specific terminal methods
})

export const mockSupabaseClient = {
  from: vi.fn().mockReturnValue(queryBuilder),
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
  },
  channel: vi.fn().mockReturnValue({
    on:        vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  }),
  removeChannel: vi.fn().mockResolvedValue('ok'),
  functions: {
    invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}

// Factory function matching the real createClient signature
export const createClient = vi.fn().mockReturnValue(mockSupabaseClient)

// ── Test helpers ───────────────────────────────────────────────────────────

/** Simulate a successful data response for the next `.single()` call */
export function mockSupabaseResponse<T>(data: T) {
  return { data, error: null }
}

/** Simulate a Supabase error response */
export function mockSupabaseError(message: string) {
  return { data: null, error: { message, code: 'PGRST000' } }
}

/** Reset all mocks between tests */
export function resetSupabaseMocks() {
  vi.clearAllMocks()
}
