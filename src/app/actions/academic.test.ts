import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { createProgramTrack, updateProgramTrack } from './academic'

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

function adminClient({
  insertError = null,
  updateError = null,
}: {
  insertError?: { code?: string; message: string } | null
  updateError?: { message: string } | null
} = {}) {
  const insert = vi.fn().mockResolvedValue({ data: null, error: insertError })
  const updateEq = vi.fn().mockResolvedValue({ data: null, error: updateError })
  const update = vi.fn().mockReturnValue({ eq: updateEq })

  return {
    insert,
    update,
    updateEq,
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'auth-user-001' } },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
        }
      }

      if (table === 'program_tracks') {
        return { insert, update }
      }

      return {}
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createProgramTrack', () => {
  it('requires a name and code', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(adminClient() as any)

    const result = await createProgramTrack(form({ name: '', code: '' }))

    expect(result).toEqual({ error: 'Name and code are required' })
  })

  it('creates an active program track with uppercased code', async () => {
    const client = adminClient()
    vi.mocked(createClient).mockResolvedValueOnce(client as any)

    await createProgramTrack(form({
      name: 'Youth Ministry',
      code: 'ym',
      description: 'Training path for youth ministry leaders',
    }))

    expect(client.insert).toHaveBeenCalledWith({
      name: 'Youth Ministry',
      code: 'YM',
      description: 'Training path for youth ministry leaders',
      created_by: 'auth-user-001',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/program-tracks')
    expect(redirect).toHaveBeenCalledWith('/admin/program-tracks')
  })

  it('returns a friendly duplicate-code error', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({ insertError: { code: '23505', message: 'duplicate key value' } }) as any,
    )

    const result = await createProgramTrack(form({
      name: 'Youth Ministry',
      code: 'YM',
    }))

    expect(result).toEqual({ error: 'A program track with that name or code already exists' })
  })
})

describe('updateProgramTrack', () => {
  it('requires a name', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(adminClient() as any)

    const result = await updateProgramTrack('track-001', form({ name: '' }))

    expect(result).toEqual({ error: 'Name is required' })
  })

  it('updates description and active status', async () => {
    const client = adminClient()
    vi.mocked(createClient).mockResolvedValueOnce(client as any)

    const result = await updateProgramTrack('track-001', form({
      name: 'Youth Ministry',
      description: 'Updated pathway',
      is_active: 'true',
    }))

    expect(result).toEqual({})
    expect(client.update).toHaveBeenCalledWith({
      name: 'Youth Ministry',
      description: 'Updated pathway',
      is_active: true,
    })
    expect(client.updateEq).toHaveBeenCalledWith('id', 'track-001')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/program-tracks')
    expect(revalidatePath).toHaveBeenCalledWith('/admin/program-tracks/track-001')
  })

  it('surfaces update errors', async () => {
    vi.mocked(createClient).mockResolvedValueOnce(
      adminClient({ updateError: { message: 'update failed' } }) as any,
    )

    const result = await updateProgramTrack('track-001', form({
      name: 'Youth Ministry',
    }))

    expect(result).toEqual({ error: 'update failed' })
  })
})
