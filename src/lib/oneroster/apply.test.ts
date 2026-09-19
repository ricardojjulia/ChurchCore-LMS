import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOneRosterJob, previewOneRosterJob } from './apply'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/utils/supabase/service', () => ({ createServiceClient: () => ({ rpc }) }))

const options = { jobId: 'job', orgId: 'org', actorAuthId: 'auth', actorUid: 'uid' }

beforeEach(() => vi.resetAllMocks())

describe('applyOneRosterJob', () => {
  it('passes the server-derived tenant and actor to the transactional function', async () => {
    const result = { success: true, status: 'applied', created: 3, updated: 0, unchanged: 0, deactivated: 0, quarantined: 0 }
    rpc.mockResolvedValue({ data: result, error: null })
    expect(await applyOneRosterJob(options)).toEqual(result)
    expect(rpc).toHaveBeenCalledWith('apply_oneroster_job', {
      p_job_id: 'job', p_org_id: 'org', p_actor_auth_id: 'auth', p_actor_uid: 'uid',
    })
  })

  it('preserves a rejected job result', async () => {
    rpc.mockResolvedValue({ data: { error: 'Import job not found' }, error: null })
    expect(await applyOneRosterJob(options)).toEqual({ error: 'Import job not found' })
  })

  it('redacts database failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'private roster details' } })
    expect(await applyOneRosterJob(options)).toEqual({ error: 'Import could not be applied' })
  })

  it('redacts transport failures', async () => {
    rpc.mockRejectedValue(new Error('private roster details'))
    expect(await applyOneRosterJob(options)).toEqual({ error: 'Import could not be applied' })
  })
})

describe('previewOneRosterJob', () => {
  it('passes the server-derived tenant and actor to the preview function', async () => {
    const result = { created: 3, updated: 0, unchanged: 3, deactivated: 0, quarantined: 0 }
    rpc.mockResolvedValue({ data: result, error: null })
    expect(await previewOneRosterJob(options)).toEqual(result)
    expect(rpc).toHaveBeenCalledWith('preview_oneroster_job', {
      p_job_id: 'job', p_org_id: 'org', p_actor_auth_id: 'auth', p_actor_uid: 'uid',
    })
  })

  it('redacts preview failures', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'private roster details' } })
    expect(await previewOneRosterJob(options)).toEqual({ error: 'Import preview could not be prepared' })
  })
})
