'use server'

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { writeAuditLog } from '@/lib/reporting/audit-logger'

type Profile = {
  uid: string
  role: string
  org_id: string | null
  email: string
}

type ClearReportsResult = {
  success: boolean
  deletedCount: number
  error?: string
}

type ArtifactCleanupRow = {
  id: string
  org_id: string
  storage_path: string | null
  archive_storage_path: string | null
}

async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('uid, role, org_id, email')
    .eq('auth_id', user.id)
    .single<Profile>()

  return data ?? null
}

export async function clearCompletedReportArtifacts(): Promise<ClearReportsResult> {
  const profile = await getCurrentProfile()
  if (!profile?.org_id) {
    return { success: false, deletedCount: 0, error: 'You must be signed in to clear reports' }
  }

  const threshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const service = createServiceRoleClient()

  const { data: artifacts, error: selectError } = await service
    .from('report_artifacts')
    .select('id, org_id, storage_path, archive_storage_path')
    .eq('org_id', profile.org_id)
    .eq('generated_by', profile.uid)
    .eq('generation_status', 'complete')
    .lt('generated_at', threshold)
    .returns<ArtifactCleanupRow[]>()

  if (selectError) {
    return { success: false, deletedCount: 0, error: selectError.message }
  }

  if (!artifacts || artifacts.length === 0) {
    return { success: true, deletedCount: 0 }
  }

  const storagePaths = artifacts.flatMap((artifact) =>
    [artifact.storage_path, artifact.archive_storage_path].filter(Boolean)
  ) as string[]

  if (storagePaths.length > 0) {
    const { error: removeError } = await service.storage.from('reports').remove(storagePaths)
    if (removeError) {
      return { success: false, deletedCount: 0, error: removeError.message }
    }
  }

  const ids = artifacts.map((artifact) => artifact.id)
  const { error: deleteError } = await service
    .from('report_artifacts')
    .delete()
    .in('id', ids)

  if (deleteError) {
    return { success: false, deletedCount: 0, error: deleteError.message }
  }

  await writeAuditLog({
    orgId: profile.org_id,
    actorId: profile.uid,
    actorRole: profile.role,
    actorEmail: profile.email,
    action: 'report_deleted',
    resourceType: 'report_artifact',
    resourceId: null,
    targetUserId: profile.uid,
    targetCourseId: null,
    metadata: { deletedCount: ids.length, olderThanDays: 7 },
    retentionClass: 'standard',
  })

  return { success: true, deletedCount: ids.length }
}
