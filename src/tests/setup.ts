import '@testing-library/jest-dom'
import { vi } from 'vitest'

// ── Next.js navigation mocks ────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push:    vi.fn(),
    replace: vi.fn(),
    back:    vi.fn(),
    refresh: vi.fn(),
  }),
  useParams:   () => ({}),
  usePathname: () => '/',
  redirect:    vi.fn(),
}))

// ── Supabase client mock (global for all unit tests) ────────────────────────
// Uses src/utils/supabase/__mocks__/client.ts automatically via Vitest's
// module resolution — unit tests never hit a real Supabase project.
vi.mock('@/utils/supabase/client')

// ── Supabase server client mock ─────────────────────────────────────────────
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select:      vi.fn().mockReturnThis(),
      eq:          vi.fn().mockReturnThis(),
      single:      vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order:       vi.fn().mockReturnThis(),
      limit:       vi.fn().mockReturnThis(),
    }),
  }),
}))
