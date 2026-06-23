'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

export async function markSelfAttendance(blockId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: block } = await supabase
    .from('course_blocks')
    .select('course_id, content')
    .eq('id', blockId)
    .single()
  if (!block) return { error: 'Block not found' }

  const content = block.content as Record<string, unknown>
  const trackingMode = (content.tracking_mode as string) ?? 'auto'
  if (!['auto', 'both'].includes(trackingMode)) return {}

  const { data: enrollment } = await supabase
    .from('course_enrollments')
    .select('id')
    .eq('course_id', block.course_id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!enrollment) return { error: 'Not enrolled' }

  const { data: existing } = await supabase
    .from('block_submissions')
    .select('id')
    .eq('block_id', blockId)
    .eq('enrollment_id', enrollment.id)
    .maybeSingle()
  if (existing) return {}

  const pointsPossible = (content.points_possible as number) ?? 0

  const { error } = await supabase.from('block_submissions').insert({
    block_id:      blockId,
    enrollment_id: enrollment.id,
    user_id:       user.id,
    status:        'submitted',
    submitted_at:  new Date().toISOString(),
    content:       { attendance_status: 'present', tracking_mode: 'auto' },
    score:         pointsPossible > 0 ? pointsPossible : null,
    max_score:     pointsPossible > 0 ? pointsPossible : null,
  })

  return error ? { error: error.message } : {}
}

export async function markStudentAttendance(params: {
  blockId:          string
  targetAuthId:     string
  attendanceStatus: 'present' | 'absent' | 'late' | 'excused'
  notes?:           string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) return { error: 'Forbidden' }

  const service = createServiceClient()

  const { data: block } = await service
    .from('course_blocks')
    .select('course_id, content')
    .eq('id', params.blockId)
    .single()
  if (!block) return { error: 'Block not found' }

  const content      = block.content as Record<string, unknown>
  const pointsPossible = (content.points_possible as number) ?? 0

  const { data: enrollment } = await service
    .from('course_enrollments')
    .select('id')
    .eq('course_id', block.course_id)
    .eq('user_id', params.targetAuthId)
    .maybeSingle()
  if (!enrollment) return { error: 'Student not enrolled' }

  let score: number | null = null
  if (pointsPossible > 0) {
    if (params.attendanceStatus === 'present') score = pointsPossible
    else if (params.attendanceStatus === 'late') score = Math.round(pointsPossible * 0.5)
    else if (params.attendanceStatus === 'absent') score = 0
  }

  const { data: existing } = await service
    .from('block_submissions')
    .select('id')
    .eq('block_id', params.blockId)
    .eq('enrollment_id', enrollment.id)
    .maybeSingle()

  const payload = {
    block_id:      params.blockId,
    enrollment_id: enrollment.id,
    user_id:       params.targetAuthId,
    status:        'graded' as const,
    submitted_at:  new Date().toISOString(),
    graded_by:     user.id,
    graded_at:     new Date().toISOString(),
    score,
    max_score:     pointsPossible > 0 ? pointsPossible : null,
    content:       {
      attendance_status: params.attendanceStatus,
      tracking_mode:     'manual',
      notes:             params.notes ?? null,
    },
  }

  if (existing) {
    const { error } = await service.from('block_submissions').update(payload).eq('id', existing.id)
    return error ? { error: error.message } : {}
  }

  const { error } = await service.from('block_submissions').insert(payload)
  return error ? { error: error.message } : {}
}
