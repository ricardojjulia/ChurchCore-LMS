'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

interface SubmitScormParams {
  blockId: string
  version: '1.2' | '2004'
  cmiData: Record<string, unknown>
  lessonStatus?: string
  scoreRaw?: number
  scoreMin?: number
  scoreMax?: number
  scoreScaled?: number
  sessionTime?: string
  suspendData?: string
  lessonLocation?: string
}

export async function submitScormCommit(params: SubmitScormParams) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return { error: 'Profile not found' }

    const { data: block } = await supabase
      .from('course_blocks')
      .select('id, course_id, org_id, gamification, content')
      .eq('id', params.blockId)
      .single()

    if (!block) return { error: 'Course block not found' }

    // Normalize SCORM 1.2 vs 2004 status
    let normalizedStatus = 'incomplete'
    const rawStatus = (params.lessonStatus || '').toLowerCase()

    if (rawStatus.includes('passed')) {
      normalizedStatus = 'passed'
    } else if (rawStatus.includes('completed')) {
      normalizedStatus = 'completed'
    } else if (rawStatus.includes('failed')) {
      normalizedStatus = 'failed'
    } else if (rawStatus.includes('incomplete')) {
      normalizedStatus = 'incomplete'
    }

    const isFinished = normalizedStatus === 'completed' || normalizedStatus === 'passed'

    // Upsert scorm_attempts
    const { error: attemptErr } = await supabase
      .from('scorm_attempts')
      .upsert(
        {
          org_id: block.org_id || profile.org_id,
          block_id: block.id,
          user_id: profile.uid,
          status: normalizedStatus,
          score_raw: params.scoreRaw ?? null,
          score_min: params.scoreMin ?? null,
          score_max: params.scoreMax ?? null,
          score_scaled: params.scoreScaled ?? null,
          session_time: params.sessionTime ?? null,
          suspend_data: params.suspendData ?? null,
          lesson_location: params.lessonLocation ?? null,
          cmi_data: params.cmiData ?? {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'block_id,user_id' }
      )

    if (attemptErr) {
      console.error('Error saving scorm attempt:', attemptErr)
    }

    let xpAwarded = 0

    // If completed or passed, record block completion and award XP
    if (isFinished) {
      const baseReward = (block.gamification as any)?.base_xp_reward ?? 50
      const engResult = await supabase.rpc('record_engagement_event', {
        p_event_type: 'block_completion',
        p_source_type: 'block',
        p_source_id: block.id,
        p_metadata: {
          score: params.scoreRaw,
          scaled: params.scoreScaled,
          scorm_status: normalizedStatus,
        },
      })

      if (!engResult.error && engResult.data) {
        xpAwarded = baseReward
      }

      // Record in block_submissions for gradebook sync
      const pct =
        params.scoreScaled !== undefined
          ? Math.round(params.scoreScaled * 100)
          : params.scoreRaw !== undefined && params.scoreMax && params.scoreMax > 0
          ? Math.round((params.scoreRaw / params.scoreMax) * 100)
          : 100

      await supabase
        .from('block_submissions')
        .upsert(
          {
            block_id: block.id,
            user_id: profile.uid,
            org_id: block.org_id || profile.org_id,
            status: 'graded',
            score: params.scoreRaw ?? 100,
            max_score: params.scoreMax ?? 100,
            grade_pct: pct,
            content: {
              scorm_status: normalizedStatus,
              version: params.version,
              cmi: params.cmiData,
            },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'block_id,user_id' }
        )
        .select()
    }

    revalidatePath(`/courses/${block.course_id}/learn`)
    revalidatePath(`/courses/${block.course_id}`)

    return {
      success: true,
      status: normalizedStatus,
      isFinished,
      xpAwarded,
    }
  } catch (err: any) {
    console.error('Unexpected error in submitScormCommit:', err)
    return { error: err?.message || 'Failed to record SCORM progress' }
  }
}
