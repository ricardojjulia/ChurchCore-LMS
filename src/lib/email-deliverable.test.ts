// @vitest-environment node
// Nothing may ever be sent to the production synthetic tenant's reserved
// addresses (COUNCIL-2026-031 D8), whichever path triggers an email.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn(async () => ({ error: null })))
vi.mock('resend', () => ({ Resend: class { emails = { send } } }))
vi.mock('@/env', () => ({ env: { resendApiKey: 're_test', emailFrom: 'LMS <noreply@churchcore.app>' } }))

import { isDeliverableAddress, sendEmail } from './email'

beforeEach(() => send.mockClear())

describe('isDeliverableAddress', () => {
  it.each([
    ['teacher@synthetic.churchcore.invalid', false],
    ['a@example', false],
    ['a@foo.test', false],
    ['a@localhost', false],
    ['', false],
    [null, false],
    ['pastor@grace.org', true],
    ['Someone@Church.COM', true],
  ])('%s → %s', (email, expected) => {
    expect(isDeliverableAddress(email)).toBe(expected)
  })
})

describe('sendEmail', () => {
  it('never sends to a synthetic (.invalid) address', async () => {
    await sendEmail({ to: 'admin@synthetic.churchcore.invalid', subject: 's', react: null as never })
    expect(send).not.toHaveBeenCalled()
  })

  it('drops reserved recipients but still sends to real ones', async () => {
    await sendEmail({ to: ['admin@synthetic.churchcore.invalid', 'pastor@grace.org'], subject: 's', react: null as never })
    expect(send).toHaveBeenCalledTimes(1)
    expect((send.mock.calls[0] as unknown as [{ to: string[] }])[0].to).toEqual(['pastor@grace.org'])
  })
})
