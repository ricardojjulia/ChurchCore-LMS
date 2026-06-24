'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

async function assertAdminOrManager() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!pr || !['admin', 'manager'].includes(pr.role)) throw new Error('Forbidden')
}

export async function addCourseToTrack(
  trackId: string,
  courseId: string,
  sequenceOrder: number,
  isRequired: boolean,
): Promise<{ error?: string }> {
  try {
    await assertAdminOrManager()
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' }
  }
  const service = createServiceClient()
  const { error } = await service.from('program_track_courses').upsert(
    { track_id: trackId, course_id: courseId, sequence_order: sequenceOrder, is_required: isRequired },
    { onConflict: 'track_id,course_id' },
  )
  if (error) return { error: 'Failed to add course to track' }
  revalidatePath(`/admin/program-tracks/${trackId}`)
  return {}
}

export async function removeCourseFromTrack(
  trackId: string,
  courseId: string,
): Promise<{ error?: string }> {
  try {
    await assertAdminOrManager()
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Unauthorized' }
  }
  const service = createServiceClient()
  const { error } = await service
    .from('program_track_courses')
    .delete()
    .eq('track_id', trackId)
    .eq('course_id', courseId)
  if (error) return { error: 'Failed to remove course from track' }
  revalidatePath(`/admin/program-tracks/${trackId}`)
  return {}
}
