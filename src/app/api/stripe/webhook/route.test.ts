// @vitest-environment node
// Synthetic QA tenants are never billed (COUNCIL-2026-031 D8): a verified
// Stripe event naming one is acknowledged but never changes the org.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { covers } from '../../../../tests/covers'

covers('api:POST /api/stripe/webhook')

const m = vi.hoisted(() => ({
  synthetic: false,
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  event: null as unknown,
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({ webhooks: { constructEvent: () => m.event } }),
}))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        contains: () => q,
        maybeSingle: async () => ({ data: table === 'organizations' ? { is_synthetic: m.synthetic } : null }),
        single: async () => ({ data: { settings: {}, stripe_customer_id: null } }),
        update: (values: Record<string, unknown>) => { m.updates.push({ table, values }); return q },
        insert: async () => ({ error: null }),
      }
      return q
    },
  }),
}))

import { POST } from './route'

function request() {
  return new Request('http://localhost/api/stripe/webhook', {
    method: 'POST', body: '{}', headers: { 'stripe-signature': 'sig' },
  }) as never
}

beforeEach(() => {
  m.synthetic = false
  m.updates = []
  m.event = { id: 'evt_1', type: 'invoice.payment_failed', data: { object: { metadata: { org_id: 'org-1' } } } }
})

describe('POST /api/stripe/webhook', () => {
  it('applies billing state to a normal org', async () => {
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(m.updates).toEqual([{ table: 'organizations', values: { status: 'suspended' } }])
  })

  it('never changes a synthetic org', async () => {
    m.synthetic = true
    const res = await POST(request())
    expect(res.status).toBe(200)
    expect(m.updates.filter((u) => u.table === 'organizations')).toEqual([])
  })
})
