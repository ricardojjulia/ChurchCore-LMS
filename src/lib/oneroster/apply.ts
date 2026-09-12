import { createServiceClient } from '@/utils/supabase/service'

interface ApplyOneRosterJobOptions {
  jobId: string
  orgId: string
  actorAuthId: string
  actorUid: string
}

export interface ApplyOneRosterResult {
  success: boolean
  status: 'applied' | 'failed'
  created: number
  updated: number
  unchanged: number
  deactivated: number
  quarantined: number
}

export type OneRosterDiff = Omit<ApplyOneRosterResult, 'success' | 'status'>

export async function previewOneRosterJob(
  options: ApplyOneRosterJobOptions,
): Promise<OneRosterDiff | { error: string }> {
  try {
    const service = createServiceClient()
    const { data, error } = await service.rpc('preview_oneroster_job', {
      p_job_id: options.jobId,
      p_org_id: options.orgId,
      p_actor_auth_id: options.actorAuthId,
      p_actor_uid: options.actorUid,
    })
    if (error || !data) return { error: 'Import preview could not be prepared' }
    return data
  } catch {
    return { error: 'Import preview could not be prepared' }
  }
}

export async function applyOneRosterJob(
  options: ApplyOneRosterJobOptions,
): Promise<ApplyOneRosterResult | { error: string }> {
  try {
    const service = createServiceClient()
    const { data, error } = await service.rpc('apply_oneroster_job', {
      p_job_id: options.jobId,
      p_org_id: options.orgId,
      p_actor_auth_id: options.actorAuthId,
      p_actor_uid: options.actorUid,
    })
    if (error || !data) return { error: 'Import could not be applied' }
    return data
  } catch {
    return { error: 'Import could not be applied' }
  }
}
