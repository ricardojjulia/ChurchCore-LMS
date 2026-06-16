import { describe, it, expect, vi } from 'vitest'
import { getHealthChecks } from './getHealthChecks'

describe('getHealthChecks', () => {
  const makeMockClient = (data: unknown, error: unknown = null) => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  })

  it('returns an empty array when Supabase returns null data', async () => {
    const client = makeMockClient(null)
    const result = await getHealthChecks(client as never)
    expect(result).toEqual([])
  })

  it('returns the data array when Supabase returns rows', async () => {
    const rows = [
      { id: '1', check_name: 'db', status: 'ok', message: null,
        action_url: null, last_checked: new Date().toISOString(), metadata: {} },
    ]
    const client = makeMockClient(rows)
    const result = await getHealthChecks(client as never)
    expect(result).toHaveLength(1)
    expect(result[0].check_name).toBe('db')
  })

  it('returns an empty array when Supabase returns an error', async () => {
    const client = makeMockClient(null, { message: 'connection failed' })
    const result = await getHealthChecks(client as never)
    expect(result).toEqual([])
  })

  it('queries the system_health_checks table', async () => {
    const client = makeMockClient([])
    await getHealthChecks(client as never)
    expect(client.from).toHaveBeenCalledWith('system_health_checks')
  })
})
