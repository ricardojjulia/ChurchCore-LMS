// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rpc: vi.fn(), insert: vi.fn() }))
vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({ rpc: m.rpc, from: () => ({ insert: m.insert }) }),
}))

import { clientIp, hashId, hit, minutes, recordEvent } from './auth-throttle'

beforeEach(() => { m.rpc.mockReset(); m.insert.mockReset() })

describe('auth throttle', () => {
  it('hashes identifiers case-insensitively and never keeps the raw value', () => {
    const a = hashId('email', ' Ana@Grace.org ')
    expect(a).toBe(hashId('email', 'ana@grace.org'))
    expect(a).toMatch(/^email:[0-9a-f]{64}$/)
    expect(a).not.toContain('grace')
  })

  it('reads the client IP from the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
    // The platform-set x-real-ip wins over a client-supplied forwarded chain.
    expect(clientIp(new Headers({ 'x-real-ip': '198.51.100.2', 'x-forwarded-for': '6.6.6.6, 198.51.100.2' }))).toBe('198.51.100.2')
    expect(clientIp(new Headers())).toBe('unknown')
    // Next's headers() adapter is a Headers with a raw `headers` field too.
    const adapter = Object.assign(new Headers({ 'x-forwarded-for': '192.0.2.7' }), { headers: { 'x-forwarded-for': '192.0.2.7' } })
    expect(clientIp(adapter)).toBe('192.0.2.7')
  })

  it('reports the database verdict', async () => {
    m.rpc.mockResolvedValue({ data: [{ allowed: false, retry_after: 120 }], error: null })
    expect(await hit('login', 'k', [10, 900])).toEqual({ allowed: false, retryAfter: 120 })
    expect(m.rpc).toHaveBeenCalledWith('auth_throttle_hit', { p_key: 'login|k', p_max: 10, p_window_seconds: 900 })
  })

  it('fails open when the limiter itself is unavailable', async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: '08006' } })
    expect(await hit('login', 'k', [10, 900])).toEqual({ allowed: true, retryAfter: 0 })
  })

  it('records events with hashed identifiers only', async () => {
    m.insert.mockResolvedValue({ error: null })
    await recordEvent('login_failed', { ip: '203.0.113.9', email: 'ana@grace.org' })
    const row = m.insert.mock.calls[0][0]
    expect(row.event).toBe('login_failed')
    expect(JSON.stringify(row)).not.toMatch(/203\.0\.113\.9|grace/)
  })

  it('rounds retry times up to whole minutes', () => {
    expect(minutes(1)).toBe(1)
    expect(minutes(61)).toBe(2)
  })
})
