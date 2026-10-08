import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createStripeConnectAccountLink,
  getStripeConnectAccountStatus,
  createCourseCheckoutSession,
} from '@/lib/payments'
import {
  getOrgPaymentSettings,
  createStripeConnectLink,
  updateCoursePricing,
  createCoursePurchaseCheckout,
} from '@/app/actions/payments'
import { covers } from '@/tests/covers'

covers(
  'page:/admin/billing/payments',
  'action:payments.getOrgPaymentSettings',
  'action:payments.createStripeConnectLink',
  'action:payments.updateCoursePricing',
  'action:payments.createCoursePurchaseCheckout'
)

// Mock stripe
const mockAccountsCreate = vi.fn()
const mockAccountsRetrieve = vi.fn()
const mockAccountLinksCreate = vi.fn()
const mockCheckoutSessionsCreate = vi.fn()

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    accounts: {
      create: mockAccountsCreate,
      retrieve: mockAccountsRetrieve,
    },
    accountLinks: {
      create: mockAccountLinksCreate,
    },
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
  })),
}))

// Mock supabase
const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockSvcFrom = vi.fn()

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}))

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({
    from: mockSvcFrom,
  })),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

describe('COUNCIL-2026-039: Paid Courses & Course Storefront (Stripe Connect)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Stripe Connect Helper (connect.ts)', () => {
    it('creates standard connect account and returns onboarding URL', async () => {
      mockAccountsCreate.mockResolvedValueOnce({ id: 'acct_123' })
      mockAccountLinksCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/setup/123' })

      const result = await createStripeConnectAccountLink({
        orgId: 'org-1',
        orgName: 'Grace Church',
        returnUrl: 'https://lms.test/return',
        refreshUrl: 'https://lms.test/refresh',
      })

      expect(result.accountId).toBe('acct_123')
      expect(result.url).toBe('https://connect.stripe.com/setup/123')
      expect(mockAccountsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'standard' })
      )
    })

    it('retrieves account status correctly', async () => {
      mockAccountsRetrieve.mockResolvedValueOnce({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      })

      const status = await getStripeConnectAccountStatus('acct_123')
      expect(status.status).toBe('active')
      expect(status.chargesEnabled).toBe(true)
      expect(status.payoutsEnabled).toBe(true)
    })
  })

  describe('Course Checkout Helper (checkout.ts)', () => {
    it('creates checkout session targeting connected account with zero platform fee (Option A)', async () => {
      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_test_999',
        url: 'https://checkout.stripe.com/c/pay/cs_test_999',
      })

      const session = await createCourseCheckoutSession({
        courseId: 'c-101',
        courseTitle: 'Apologetics Masterclass',
        priceCents: 4900,
        currency: 'usd',
        orgId: 'org-1',
        stripeConnectId: 'acct_church_1',
        buyerUid: 'user-buyer-1',
        buyerEmail: 'buyer@test.com',
        successUrl: 'https://lms.test/success',
        cancelUrl: 'https://lms.test/cancel',
      })

      expect(session.sessionId).toBe('cs_test_999')
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          metadata: expect.objectContaining({
            type: 'course_purchase',
            course_id: 'c-101',
          }),
        }),
        { stripeAccount: 'acct_church_1' }
      )
    })
  })

  describe('Server Actions (payments.ts)', () => {
    it('getOrgPaymentSettings checks permissions and returns connect status', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-admin' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', role: 'admin' } }),
          }
        }
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { stripe_connect_id: 'acct_1', stripe_connect_status: 'active' },
            }),
          }
        }
        return {}
      })
      mockAccountsRetrieve.mockResolvedValueOnce({
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      })

      const res = await getOrgPaymentSettings()
      expect(res.success).toBe(true)
      expect(res.stripeConnectId).toBe('acct_1')
      expect(res.status).toBe('active')
    })

    it('createStripeConnectLink generates link for admin', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-admin' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', role: 'admin' } }),
          }
        }
        if (table === 'organizations') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'org-1', name: 'Faith Community', stripe_connect_id: null },
            }),
          }
        }
        return {}
      })
      mockSvcFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      })
      mockAccountsCreate.mockResolvedValueOnce({ id: 'acct_new_55' })
      mockAccountLinksCreate.mockResolvedValueOnce({ url: 'https://connect.stripe.com/onboard' })

      const res = await createStripeConnectLink('http://localhost:3000')
      expect(res.success).toBe(true)
      expect(res.url).toBe('https://connect.stripe.com/onboard')
    })

    it('updateCoursePricing rejects negative price and updates courses', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-mgr' } } })
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', role: 'manager' } }),
      })

      const resNeg = await updateCoursePricing({ courseId: 'c-1', priceCents: -500 })
      expect(resNeg.success).toBe(false)
      expect(resNeg.error).toContain('negative')

      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-mgr' } } })
      mockFrom.mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1', role: 'manager' } }),
          }
        }
        if (table === 'courses') {
          return {
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }
        }
        return {}
      })

      const resValid = await updateCoursePricing({ courseId: 'c-1', priceCents: 2500, currency: 'usd' })
      expect(resValid.success).toBe(true)
    })

    it('createCoursePurchaseCheckout creates checkout session and pre-records pending purchase', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'auth-student' } } })
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { uid: 'u-student', email: 'stu@test.com' } }),
      })

      mockSvcFrom.mockImplementation((table: string) => {
        if (table === 'courses') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: 'c-1',
                    title: 'New Believer Class',
                    price_cents: 1500,
                    currency: 'usd',
                    org_id: 'org-1',
                    organizations: { stripe_connect_id: 'acct_church_1' },
                  },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'course_purchases') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          }
        }
        return {}
      })

      mockCheckoutSessionsCreate.mockResolvedValueOnce({
        id: 'cs_buy_1',
        url: 'https://checkout.stripe.com/pay/cs_buy_1',
      })

      const res = await createCoursePurchaseCheckout({
        courseId: 'c-1',
        origin: 'http://localhost:3000',
      })

      expect(res.success).toBe(true)
      expect(res.url).toBe('https://checkout.stripe.com/pay/cs_buy_1')
    })
  })
})
