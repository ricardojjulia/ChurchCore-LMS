import { describe, it, expect, vi } from 'vitest'
import { createClient, mockSupabaseClient } from './__mocks__/client'

// This test validates the mock contract — not the real Supabase client.
// The real client is tested end-to-end against the test Supabase project.
describe('Supabase client (mock)', () => {
  it('createClient returns an object with a .from() method', () => {
    const client = createClient()
    expect(client).toHaveProperty('from')
    expect(typeof client.from).toBe('function')
  })

  it('createClient returns an object with .auth methods', () => {
    const client = createClient()
    expect(client.auth).toBeDefined()
    expect(typeof client.auth.getUser).toBe('function')
    expect(typeof client.auth.signInWithPassword).toBe('function')
    expect(typeof client.auth.signOut).toBe('function')
  })

  it('.from() supports chainable query methods', () => {
    const client = createClient()
    const builder = client.from('notifications')
    expect(builder).toHaveProperty('select')
    expect(builder).toHaveProperty('eq')
    expect(builder).toHaveProperty('order')
    expect(builder).toHaveProperty('limit')
    expect(builder).toHaveProperty('single')
  })

  it('auth.getUser() resolves with { data: { user: null } } by default', async () => {
    const client = createClient()
    const result = await client.auth.getUser()
    expect(result.data.user).toBeNull()
    expect(result.error).toBeNull()
  })

  it('mockSupabaseClient.channel returns an object with .on() and .subscribe()', () => {
    const channel = mockSupabaseClient.channel('test-channel')
    expect(channel).toHaveProperty('on')
    expect(channel).toHaveProperty('subscribe')
  })
})
