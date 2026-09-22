'use server'

/**
 * @fileoverview Gradebook grid server actions — COUNCIL-2026-030
 *
 * Provides getGradebookGrid() (read) and setGradeCell() (write-per-cell)
 * for the holistic gradebook grid route (/courses/[id]/gradebook).
 *
 * Security model:
 *   • auth + role check: same pattern as gradeSubmission() in learning.ts
 *   • ownership check in setGradeCell(): mirrors gradeDiscussionSubmission()'s
 *     cross-org/cross-course guard — uses service client for the lookup,
 *     returns identical { error: 'Not found' } for both "doesn't exist" and
 *     "not yours" so the response is not a distinguishing oracle
 *   • RLS defense-in-depth: Prompt A's RLS policies enforce the same ownership
 *     constraint at the DB layer for the authenticated-client writes
 */

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'
import { applyGradeSideEffects } from './learning'
import type { GradebookGridRow } from '@/types/reporting'

// ── Get the full gradebook grid for a course ──────────────────────────────────

export async function getGradebookGrid(
  courseId: string,
): Promise<{ data?: GradebookGridRow[]; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  const { data, error } = await supabase.rpc('get_course_gradebook_grid', {
    p_course_id: courseId,
  })

  if (error) return { error: 'Failed to load gradebook' }

  return { data: (data ?? []) as GradebookGridRow[] }
}

// ── Save a single grade cell ──────────────────────────────────────────────────

export async function setGradeCell({
  courseId,
  studentUid,
  blockId,
  score,
  feedback,
}: {
  courseId:   string
  studentUid: string
  blockId:    string
  score:      number
  feedback:   string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  // ── Ownership check (D4.2) ────────────────────────────────────────────────
  // Use service client to fetch the block's course/org — same pattern as
  // gradeDiscussionSubmission()'s cross-org check (learning.ts ~lines 671-686).
  // Returns identical 'Not found' for both "doesn't exist" and "wrong org/owner"
  // so this endpoint is not a distinguishing oracle.
  const service = createServiceClient()

  const { data: blockCheck } = await service
    .from('course_blocks')
    .select('course_id, courses!inner(org_id, owner_id)')
    .eq('id', blockId)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join type is not narrowed
  const blockCourse = (blockCheck?.courses as any)

  if (!blockCheck || blockCourse?.org_id !== profile.org_id) {
    return { error: 'Not found' }
  }

  // Teacher must own the course; admin/manager have org-wide access
  if (profile.role === 'teacher' && blockCourse?.owner_id !== profile.uid) {
    return { error: 'Not found' }
  }

  // ── Find or create the submission row ─────────────────────────────────────
  const { data: existingSub } = await supabase
    .from('block_submissions')
    .select('id, max_score')
    .eq('block_id', blockId)
    .eq('user_id', studentUid)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let subMaxScore: number | null = null

  if (existingSub) {
    // UPDATE path — student previously submitted this block
    const { error: updateError } = await supabase
      .from('block_submissions')
      .update({
        score,
        status:    'graded',
        feedback:  feedback.trim() || null,
        graded_by: profile.uid,
        graded_at: new Date().toISOString(),
      })
      .eq('id', existingSub.id)

    if (updateError) return { error: 'Failed to save grade' }

    subMaxScore = existingSub.max_score ?? null
  } else {
    // INSERT path (D6) — no prior submission; e.g. in-person assessment
    // Look up the student's active enrollment to get the required enrollment_id FK
    const { data: enrollment } = await supabase
      .from('course_enrollments')
      .select('id')
      .eq('course_id', courseId)
      .eq('user_id', studentUid)
      .eq('role', 'student')
      .eq('status', 'active')
      .maybeSingle()

    if (!enrollment) {
      return { error: 'Student is not enrolled in this course' }
    }

    const { error: insertError } = await supabase
      .from('block_submissions')
      .insert({
        enrollment_id:  enrollment.id,
        user_id:        studentUid,
        block_id:       blockId,
        attempt_number: 1,
        status:         'graded',
        content:        {},
        score,
        feedback:       feedback.trim() || null,
        graded_by:      profile.uid,
        graded_at:      new Date().toISOString(),
        submitted_at:   null,
        org_id:         profile.org_id,
      })

    if (insertError) return { error: 'Failed to save grade' }

    // max_score is unknown for a fresh grade-without-submission row
    subMaxScore = null
  }

  // ── Apply shared grade side-effects (XP, notification, email, guardian) ──
  // D7: identical behavior whether grade entered via grid or existing form
  await applyGradeSideEffects(
    { user_id: studentUid, block_id: blockId, max_score: subMaxScore, org_id: profile.org_id },
    score,
    feedback,
  )

  revalidatePath('/courses/[id]/gradebook', 'page')
  return {}
}
