// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { isCronRequest } from './cron-auth'

const req = (headers: Record<string, string>) => new Request('http://localhost/x', { headers })

afterEach(() => { delete process.env.CRON_SECRET })

describe('isCronRequest', () => {
  it('fails closed when CRON_SECRET is unset', () => {
    expect(isCronRequest(req({ authorization: 'Bearer ' }))).toBe(false)
    expect(isCronRequest(req({ authorization: 'Bearer undefined' }))).toBe(false)
  })

  it('accepts the secret as a bearer token or x-cron-secret header', () => {
    process.env.CRON_SECRET = 'cron-secret-value'
    expect(isCronRequest(req({ authorization: 'Bearer cron-secret-value' }))).toBe(true)
    expect(isCronRequest(req({ 'x-cron-secret': 'cron-secret-value' }))).toBe(true)
  })

  it('rejects a wrong or missing secret', () => {
    process.env.CRON_SECRET = 'cron-secret-value'
    expect(isCronRequest(req({ authorization: 'Bearer cron-secret-valuX' }))).toBe(false)
    expect(isCronRequest(req({}))).toBe(false)
  })
})
