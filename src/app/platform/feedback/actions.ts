'use server'

import { revalidatePath }       from 'next/cache'
import { createServerClient }   from '@/lib/supabase/server'
import { createServiceClient }  from '@/utils/supabase/service'

// Mirrors the assertPlatformAdmin shape used throughout src/app/platform/actions.ts.
async function assertPlatformAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) throw new Error('Forbidden')
  return user
}

export type TriageAction =
  | 'fixed'
  | 'no_action_needed'
  | 'acknowledged'
  | 'implemented'
  | 'received_closed'

export async function updateFeedbackTriage(
  id: string,
  triageAction: TriageAction | null,
): Promise<{ error?: string }> {
  try {
    await assertPlatformAdmin()
    const service = createServiceClient()
    const { error } = await service
      .from('platform_feedback')
      .update({ triage_action: triageAction, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/platform/feedback')
    return {}
  } catch {
    return { error: 'Failed to update triage action' }
  }
}

export async function markFeedbackProcessed(
  id: string,
  processed: boolean,
): Promise<{ error?: string }> {
  try {
    await assertPlatformAdmin()
    const service = createServiceClient()
    const { error } = await service
      .from('platform_feedback')
      .update({ processed, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    revalidatePath('/platform/feedback')
    return {}
  } catch {
    return { error: 'Failed to update processed status' }
  }
}
