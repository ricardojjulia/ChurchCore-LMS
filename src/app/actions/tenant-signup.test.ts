// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signupTenant } from './tenant-signup'
import { covers } from '../../../tests/playwright/fixtures/covers'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  createUser: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: mocks.from,
    auth: {
      admin: {
        createUser: mocks.createUser,
      },
    },
  }),
}))

describe('signupTenant', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    covers('action:tenant-signup.signupTenant', 'page:/signup')

    mocks.createUser.mockResolvedValue({
      data: { user: { id: 'auth-123' } },
      error: null,
    })

    mocks.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        const query: any = {
          select: () => query,
          eq: () => query,
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: { id: 'org-123', slug: 'grace-church', name: 'Grace Church' }, error: null })),
          insert: vi.fn(() => query),
          delete: vi.fn(() => query),
        }
        return query
      }

      if (table === 'profiles') {
        const query: any = {
          select: () => query,
          eq: () => query,
          single: vi.fn(async () => ({ data: { uid: 'profile-uid-123' }, error: null })),
        }
        return query
      }

      if (table === 'academic_terms') {
        const query: any = {
          insert: vi.fn(() => query),
          select: () => query,
          single: vi.fn(async () => ({ data: { id: 'term-123' }, error: null })),
        }
        return query
      }

      if (table === 'courses') {
        const query: any = {
          insert: vi.fn(() => query),
          select: () => query,
          single: vi.fn(async () => ({ data: { id: 'course-123' }, error: null })),
        }
        return query
      }

      const query: any = {
        insert: vi.fn(async () => ({ error: null })),
      }
      return query
    })
  })

  it('rejects invalid or missing organization names', async () => {
    const res = await signupTenant({
      orgName: '',
      orgSlug: 'valid-slug',
      adminName: 'Admin User',
      adminEmail: 'admin@example.com',
      password: 'password123',
    })
    expect(res.error).toContain('Organization name must be between 2 and 100 characters')
  })

  it('rejects invalid or reserved slugs', async () => {
    const resReserved = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: 'admin',
      adminName: 'Admin User',
      adminEmail: 'admin@example.com',
      password: 'password123',
    })
    expect(resReserved.error).toContain('slug is reserved')

    const resMalformed = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: '-invalid_slug-',
      adminName: 'Admin User',
      adminEmail: 'admin@example.com',
      password: 'password123',
    })
    expect(resMalformed.error).toContain('can only contain lowercase letters')
  })

  it('rejects passwords shorter than 8 characters', async () => {
    const res = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: 'grace-church',
      adminName: 'Admin User',
      adminEmail: 'admin@example.com',
      password: 'short',
    })
    expect(res.error).toContain('at least 8 characters')
  })

  it('rejects if the slug is already in use by another tenant', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        const query: any = {
          select: () => query,
          eq: () => query,
          maybeSingle: vi.fn(async () => ({ data: { id: 'existing-org-id' }, error: null })),
        }
        return query
      }
      return {}
    })

    const res = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: 'grace-church',
      adminName: 'Admin User',
      adminEmail: 'admin@example.com',
      password: 'password123',
    })
    expect(res.error).toContain('already exists')
  })

  it('successfully creates a 14-day trial organization, admin user, and seeds initial content', async () => {
    const res = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: 'grace-church',
      adminName: 'Admin User',
      adminEmail: 'admin@grace.org',
      password: 'password123',
    })

    expect(res.success).toBe(true)
    expect(res.orgId).toBe('org-123')
    expect(res.orgSlug).toBe('grace-church')

    expect(mocks.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@grace.org',
        app_metadata: {
          org_id: 'org-123',
          role: 'admin',
        },
      })
    )
  })

  it('handles duplicate user email errors and rolls back the created organization', async () => {
    let deletedOrgId: string | null = null
    mocks.createUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address already registered' },
    })

    mocks.from.mockImplementation((table: string) => {
      if (table === 'organizations') {
        const query: any = {
          select: () => query,
          eq: (col: string, val: string) => {
            if (col === 'id') deletedOrgId = val
            return query
          },
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          single: vi.fn(async () => ({ data: { id: 'org-to-rollback', slug: 'grace-church' }, error: null })),
          insert: vi.fn(() => query),
          delete: vi.fn(() => query),
        }
        return query
      }
      return {}
    })

    const res = await signupTenant({
      orgName: 'Grace Church',
      orgSlug: 'grace-church',
      adminName: 'Admin User',
      adminEmail: 'admin@grace.org',
      password: 'password123',
    })

    expect(res.error).toContain('already exists')
    expect(deletedOrgId).toBe('org-to-rollback')
  })
})
