'use server'

import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { revalidatePath } from 'next/cache'

// ── Helper: award XP via RPC ─────────────────────────────────────────────────

async function tryAwardXp(supabase: Awaited<ReturnType<typeof createClient>>, uid: string, amount: number) {
  if (amount <= 0) return null
  const { data } = await supabase.rpc('award_xp', { p_uid: uid, p_amount: amount })
  return data as { new_xp: number; new_level: number; leveled_up: boolean; prev_level: number } | null
}

// ── Enroll self in a course ───────────────────────────────────────────────────

export async function enrollSelf(courseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, current_level, display_name, email')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  // Server-side prerequisite validation
  const { data: course } = await supabase
    .from('courses')
    .select('title, min_required_level, prerequisite_course_id')
    .eq('id', courseId)
    .single()

  if (course) {
    const studentLevel = (profile as any).current_level ?? 1
    const requiredLevel = course.min_required_level ?? 1
    if (studentLevel < requiredLevel) {
      return { error: `Level ${requiredLevel} required — you are level ${studentLevel}` }
    }
    if (course.prerequisite_course_id) {
      const { data: prereq } = await supabase
        .from('enrollments')
        .select('transit_status')
        .eq('user_id', profile.uid)
        .eq('course_id', course.prerequisite_course_id)
        .eq('transit_status', 'completed')
        .maybeSingle()
      if (!prereq) {
        return { error: 'You must complete the prerequisite course first' }
      }
    }
  }

  const { error } = await supabase
    .from('enrollments')
    .insert({
      user_id:          profile.uid,
      course_id:        courseId,
      transit_status:   'not_started',
      progress_percent: 0,
    })

  if (error) {
    if (error.code === '23505') return { error: 'Already enrolled' }
    return { error: error.message }
  }

  // Enrollment confirmation email (optional — skipped if RESEND_API_KEY not set)
  if (process.env.RESEND_API_KEY && (profile as any).email) {
    try {
      const { Resend } = await import('resend')
      const resend    = new Resend(process.env.RESEND_API_KEY)
      const siteUrl   = process.env.NEXT_PUBLIC_SITE_URL ?? ''
      const from      = process.env.RESEND_FROM_EMAIL ?? 'ChurchCore LMS <noreply@churchcore.app>'
      const name      = (profile as any).display_name ?? 'there'
      const title     = (course as any)?.title ?? 'your new course'
      await resend.emails.send({
        from,
        to:      (profile as any).email,
        subject: `You're enrolled: ${title}`,
        html: `
<p>Hi ${name},</p>
<p>You've successfully enrolled in <strong>${title}</strong>. You can start learning right away.</p>
<p style="margin-top:24px">
  <a href="${siteUrl}/courses/${courseId}/learn"
     style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
    Start learning →
  </a>
</p>`,
      })
    } catch {
      // Email failure must never break enrollment
    }
  }

  revalidatePath(`/courses/${courseId}`)
  revalidatePath('/dashboard')
  return {}
}

// ── Mark a content block as viewed + update enrollment progress + award XP ───

export async function markBlockViewed(
  courseId:    string,
  blockId:     string,
  totalBlocks: number,
  viewedCount: number,
  blockXp:     number = 0,
): Promise<{ justCompleted: boolean; xpAwarded: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { justCompleted: false, xpAwarded: 0 }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, email')
    .eq('auth_id', user.id)
    .single()
  if (!profile) return { justCompleted: false, xpAwarded: 0 }

  const newProgress = totalBlocks > 0 ? Math.round((viewedCount / totalBlocks) * 100) : 0

  // Never decrease progress (student may navigate back to review earlier blocks)
  const { data: existing } = await supabase
    .from('enrollments')
    .select('progress_percent, transit_status')
    .eq('user_id',   profile.uid)
    .eq('course_id', courseId)
    .single()

  const finalProgress  = Math.max(newProgress, Number(existing?.progress_percent ?? 0))
  const justCompleted  = finalProgress >= 100 && existing?.transit_status !== 'completed'
  const transitStatus  = finalProgress >= 100 ? 'completed' : 'in_progress'

  await supabase
    .from('enrollments')
    .update({
      last_accessed_at: new Date().toISOString(),
      progress_percent: finalProgress,
      transit_status:   transitStatus,
      ...(justCompleted ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('user_id',   profile.uid)
    .eq('course_id', courseId)

  // Award XP for this block
  let xpAwarded = 0
  if (blockXp > 0) {
    await tryAwardXp(supabase, profile.uid, blockXp)
    xpAwarded = blockXp
  }

  // On course completion: bonus 100 XP + issue certificate (only on first completion)
  if (justCompleted) {
    await tryAwardXp(supabase, profile.uid, 100)
    xpAwarded += 100

    const { data: certData } = await supabase.rpc('issue_certificate', {
      p_uid:       profile.uid,
      p_course_id: courseId,
    })
    const cert = certData as { certificate_no?: string; letter_grade?: string } | null

    // Certificate issued email (optional — skipped if RESEND_API_KEY not set)
    if (process.env.RESEND_API_KEY && (profile as any).email) {
      try {
        const { data: courseRow } = await supabase
          .from('courses')
          .select('title')
          .eq('id', courseId)
          .single()
        const { Resend } = await import('resend')
        const resend   = new Resend(process.env.RESEND_API_KEY)
        const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? ''
        const from     = process.env.RESEND_FROM_EMAIL ?? 'ChurchCore LMS <noreply@churchcore.app>'
        const name     = (profile as any).display_name ?? 'there'
        const title    = courseRow?.title ?? 'your course'
        const certNo   = cert?.certificate_no ?? ''
        const grade    = cert?.letter_grade ?? 'N/A'
        await resend.emails.send({
          from,
          to:      (profile as any).email,
          subject: `Certificate earned: ${title}`,
          html: `
<p>Hi ${name},</p>
<p>Congratulations — you've completed <strong>${title}</strong> and earned your certificate!</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px">Certificate no.</td>
      <td style="padding:4px 0;font-weight:600;font-size:14px">${certNo}</td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px">Final grade</td>
      <td style="padding:4px 0;font-weight:600;font-size:14px">${grade}</td></tr>
</table>
<p style="margin-top:24px">
  <a href="${siteUrl}/certificates"
     style="background:#4f46e5;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
    View your certificates →
  </a>
</p>`,
        })
      } catch {
        // Email failure must never break completion
      }
    }
  }

  revalidatePath(`/courses/${courseId}/learn`)
  revalidatePath('/dashboard')
  return { justCompleted, xpAwarded }
}

// ── Submit an assignment block ────────────────────────────────────────────────

export async function submitAssignment(
  blockId:   string,
  body:      string,
  maxScore:  number,
  fileUrl?:  string,
  fileName?: string,
): Promise<{ error?: string; submissionId?: string; xpAwarded?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const trimmed = body.trim()
  if (!trimmed) return { error: 'Submission cannot be empty' }
  if (trimmed.length > 50000) return { error: 'Submission too long (max 50,000 characters)' }

  // Check most recent non-deleted submission for this student+block
  const { data: existing } = await supabase
    .from('block_submissions')
    .select('id, status')
    .eq('block_id',   blockId)
    .eq('user_id',    profile.uid)
    .eq('is_deleted', false)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.status === 'submitted') {
    return { error: 'Already submitted and awaiting grading' }
  }

  // Count all prior submissions to derive the correct attempt number
  const { count } = await supabase
    .from('block_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('block_id',   blockId)
    .eq('user_id',    profile.uid)
    .eq('is_deleted', false)

  const attemptNumber = (count ?? 0) + 1

  const contentPayload: Record<string, unknown> = { text: trimmed }
  if (fileUrl)  contentPayload.file_url  = fileUrl
  if (fileName) contentPayload.file_name = fileName

  const { data: sub, error } = await supabase
    .from('block_submissions')
    .insert({
      block_id:       blockId,
      user_id:        profile.uid,
      status:         'submitted',
      content:        contentPayload,
      max_score:      maxScore,
      submitted_at:   new Date().toISOString(),
      attempt_number: attemptNumber,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  const XP_ASSIGNMENT_SUBMIT = 10
  await tryAwardXp(supabase, profile.uid, XP_ASSIGNMENT_SUBMIT)

  // Mark enrollment as in_progress if still not_started
  const { data: block } = await supabase
    .from('course_blocks')
    .select('course_id')
    .eq('id', blockId)
    .single()

  if (block?.course_id) {
    await supabase
      .from('enrollments')
      .update({ transit_status: 'in_progress', last_accessed_at: new Date().toISOString() })
      .eq('user_id',         profile.uid)
      .eq('course_id',       block.course_id)
      .eq('transit_status',  'not_started')
  }

  revalidatePath('/courses/[id]/learn', 'page')
  return { submissionId: sub.id, xpAwarded: XP_ASSIGNMENT_SUBMIT }
}

// ── Submit a quiz block (auto-graded) ────────────────────────────────────────

interface QuizAnswer {
  questionId:    string
  selectedIndex: number
}

interface QuizQuestion {
  id:            string
  points:        number
  correct_index: number
}

export async function submitQuiz(
  blockId:   string,
  answers:   QuizAnswer[],
  questions: QuizQuestion[],
  maxScore:  number,
  blockXp:   number = 0,
): Promise<{ error?: string; gradePct?: number; earnedScore?: number; xpAwarded?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  // Auto-grade
  let earnedScore = 0
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedIndex]))
  for (const q of questions) {
    if (answerMap.get(q.id) === q.correct_index) earnedScore += q.points
  }

  const { error } = await supabase
    .from('block_submissions')
    .insert({
      block_id:     blockId,
      user_id:      profile.uid,
      status:       'graded',
      content:      { answers },
      score:        earnedScore,
      max_score:    maxScore,
      submitted_at: new Date().toISOString(),
      graded_at:    new Date().toISOString(),
    })

  if (error) return { error: error.message }

  const gradePct = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0

  // Award XP: block base XP scaled by score percentage (minimum 50% of block XP)
  let xpAwarded = 0
  if (blockXp > 0) {
    const xpEarned = Math.max(Math.round(blockXp * (gradePct / 100)), Math.round(blockXp * 0.5))
    await tryAwardXp(supabase, profile.uid, xpEarned)
    xpAwarded = xpEarned
  } else {
    // Default: 5 XP per quiz submission
    await tryAwardXp(supabase, profile.uid, 5)
    xpAwarded = 5
  }

  revalidatePath('/courses/[id]/learn', 'page')
  return { gradePct, earnedScore, xpAwarded }
}

// ── Grade a submission (instructor) ──────────────────────────────────────────

export async function gradeSubmission(
  submissionId: string,
  score:        number,
  feedback:     string,
): Promise<{ error?: string }> {
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

  const { data: sub } = await supabase
    .from('block_submissions')
    .select('id, max_score, user_id, block_id')
    .eq('id', submissionId)
    .single()

  if (!sub) return { error: 'Submission not found' }

  const { error } = await supabase
    .from('block_submissions')
    .update({
      score:     score,
      status:    'graded',
      feedback:  feedback.trim() || null,
      graded_by: profile.uid,
      graded_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  if (error) return { error: error.message }

  // Award XP to student proportional to their grade (max_score is block XP or 100)
  if (sub.max_score && sub.max_score > 0) {
    const gradePct = Math.round((score / sub.max_score) * 100)
    if (gradePct >= 50) {
      const service = createServiceClient()
      const xpEarned = Math.round(50 * (gradePct / 100))
      await service.rpc('award_xp', { p_uid: sub.user_id, p_amount: xpEarned })
    }
  }

  // Notify student (in-app)
  const service = createServiceClient()
  await service
    .from('notifications')
    .insert({
      user_id: sub.user_id,
      type:    'grade_posted',
      title:   'Assignment graded',
      body:    `Your submission received a score of ${score}/${sub.max_score ?? '?'}${feedback ? `. Feedback: ${feedback.slice(0, 100)}` : ''}`,
      link:    null,
    })
    .throwOnError()

  // Email notification via Resend (optional — skipped if RESEND_API_KEY is not set)
  if (process.env.RESEND_API_KEY) {
    try {
      const { data: studentProfile } = await service
        .from('profiles')
        .select('email, display_name')
        .eq('uid', sub.user_id)
        .single()

      if (studentProfile?.email) {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        const pct = sub.max_score ? Math.round((score / sub.max_score) * 100) : null
        const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'ChurchCore LMS <noreply@churchcore.app>'
        await resend.emails.send({
          from:    fromEmail,
          to:      studentProfile.email,
          subject: `Your assignment has been graded — ${score}/${sub.max_score ?? '?'}`,
          html: `
<p>Hi ${studentProfile.display_name ?? 'there'},</p>
<p>Your assignment submission has been graded.</p>
<table style="border-collapse:collapse;margin:16px 0">
  <tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px">Score</td>
      <td style="padding:4px 0;font-weight:600;font-size:14px">${score} / ${sub.max_score ?? '?'}${pct !== null ? ` (${pct}%)` : ''}</td></tr>
  ${feedback ? `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-size:14px;vertical-align:top">Feedback</td>
      <td style="padding:4px 0;font-size:14px">${feedback}</td></tr>` : ''}
</table>
<p style="margin-top:24px">
  <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/courses" style="background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
    View your courses →
  </a>
</p>`,
        })
      }
    } catch {
      // Email failure must never break the grading action
    }
  }

  revalidatePath('/courses/[id]/submissions', 'page')
  return {}
}

// ── Grade a discussion block submission (teacher/admin/manager) ───────────────

export async function gradeDiscussionSubmission({
  submissionId,
  score,
  maxScore,
}: {
  submissionId: string
  score: number
  maxScore: number
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return { error: 'Unauthorized' }
  }

  // Validate score bounds
  if (score < 0)          return { error: 'Score cannot be negative' }
  if (maxScore <= 0)      return { error: 'Max score must be greater than zero' }
  if (score > maxScore)   return { error: 'Score cannot exceed max score' }

  // Cross-tenant check: verify the submission belongs to the caller's org.
  // A teacher from Org A must not be able to grade Org B submissions.
  // Same "Not found" response whether the row is missing or belongs to another org.
  const service = createServiceClient()

  const { data: ownershipCheck } = await service
    .from('block_submissions')
    .select('id, course_blocks!inner(course_id, courses!inner(org_id))')
    .eq('id', submissionId)
    .single()

  // Walk the nested join result to confirm the org matches
  const submissionOrgId =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join type is not narrowed
    (ownershipCheck?.course_blocks as any)?.courses?.org_id ?? null

  if (!ownershipCheck || submissionOrgId !== profile.org_id) {
    return { error: 'Not found' }
  }

  // Service client UPDATE — graded_by is set from the server session, never from client input.
  // graded_by references profiles.uid (see migration 027: block_submissions_graded_by_fkey).
  const { error: updateError } = await service
    .from('block_submissions')
    .update({
      score,
      max_score:  maxScore,
      graded_by:  profile.uid,
      graded_at:  new Date().toISOString(),
      status:     'graded',
    })
    .eq('id', submissionId)

  if (updateError) return { error: 'Failed to save grade' }

  revalidatePath('/courses/[id]/learn', 'page')
  return {}
}
