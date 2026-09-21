import type { SupabaseClient } from '@supabase/supabase-js'

// Shared enrollment-gating logic (COUNCIL-2026-026 D2), extracted from
// enrollSelf() so it is callable from both a session-bound Server Action
// (enrollSelf) and a no-session service-client context (registration-time
// auto-enroll in src/app/join/actions.ts). Behavior is identical to the
// original enrollSelf() checks — this is a pure extraction, not new logic.

export type SkipReason =
  | 'invite_only'
  | 'cohort_gated_no_access'
  | 'level_too_low'
  | 'prerequisite_incomplete'
  | 'age_out_of_range'
  | 'age_unverifiable'

export interface EnrollCoreParams {
  supabase:   SupabaseClient
  authId:     string
  courseId:   string
  sectionId?: string
  // When true, an age-restricted course is skipped (not silently allowed)
  // when the enrollee has no date_of_birth on file, instead of falling
  // through ungated. A brand-new /join/[slug] registrant never has a DOB —
  // the join form doesn't collect one — so without this, every age-gated
  // auto-enroll course would bypass its own restriction for every new
  // student. Only the registration-time auto-enroll loop
  // (src/app/join/actions.ts) sets this; enrollSelf() leaves it unset so
  // existing self-enrollment behavior (and its parity test) is unchanged.
  requireVerifiableAge?: boolean
}

export type EnrollCoreResult =
  | { ok: true; courseTitle?: string }
  | { ok: false; skipped: true; reason: SkipReason; message: string }
  | { ok: false; skipped: false; error: string }

export async function enrollCore({
  supabase,
  authId,
  courseId,
  sectionId,
  requireVerifiableAge,
}: EnrollCoreParams): Promise<EnrollCoreResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, current_level, date_of_birth')
    .eq('auth_id', authId)
    .single()

  if (!profile) return { ok: false, skipped: false, error: 'Profile not found' }

  // ── Enrollment-type gate (COUNCIL-2026-016 Prompt A) ────────────────────
  // Resolve which section governs this enrollment. When the caller passes an
  // explicit sectionId we use it directly; otherwise we look up the most
  // recently created active section linked to the course's blueprint (if any).
  let resolvedSectionId: string | null = sectionId ?? null

  if (!resolvedSectionId) {
    const { data: courseForBlueprint } = await supabase
      .from('courses')
      .select('blueprint_id')
      .eq('id', courseId)
      .single()

    if (courseForBlueprint?.blueprint_id) {
      const { data: linkedSection } = await supabase
        .from('course_sections')
        .select('id')
        .eq('blueprint_id', courseForBlueprint.blueprint_id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      resolvedSectionId = linkedSection?.id ?? null
    }
  }

  if (resolvedSectionId) {
    const { data: section } = await supabase
      .from('course_sections')
      .select('enrollment_type')
      .eq('id', resolvedSectionId)
      .single()

    if (section) {
      if (section.enrollment_type === 'invite_only') {
        return { ok: false, skipped: true, reason: 'invite_only', message: 'Enrollment by invitation only.' }
      }

      if (section.enrollment_type === 'cohort_gated') {
        // Find active cohort memberships for this student.
        // cohort_members.user_id is an FK to auth.users(id) — i.e. the auth_id.
        const { data: membership } = await supabase
          .from('cohort_members')
          .select('cohort_id')
          .eq('user_id', authId)
          .eq('status', 'active')

        const cohortIds = (membership ?? []).map((m) => m.cohort_id) as string[]

        let hasAccess = false
        if (cohortIds.length > 0) {
          // Confirm at least one of the student's cohorts is enrolled into
          // this section via cohort_section_enrollments.
          const { data: cse } = await supabase
            .from('cohort_section_enrollments')
            .select('id')
            .eq('section_id', resolvedSectionId)
            .in('cohort_id', cohortIds)
            .limit(1)
            .maybeSingle()

          hasAccess = !!cse
        }

        if (!hasAccess) {
          return { ok: false, skipped: true, reason: 'cohort_gated_no_access', message: 'This course requires cohort membership.' }
        }
      }
      // enrollment_type === 'open' → fall through and allow
    }
  }

  // Server-side prerequisite validation
  const { data: course } = await supabase
    .from('courses')
    .select('title, min_required_level, prerequisite_course_id, age_min, age_max')
    .eq('id', courseId)
    .single()

  if (course) {
    const studentLevel = profile.current_level ?? 1
    const requiredLevel = course.min_required_level ?? 1
    if (studentLevel < requiredLevel) {
      return {
        ok: false, skipped: true, reason: 'level_too_low',
        message: `Level ${requiredLevel} required — you are level ${studentLevel}`,
      }
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
        return {
          ok: false, skipped: true, reason: 'prerequisite_incomplete',
          message: 'You must complete the prerequisite course first',
        }
      }
    }

    // Server-side age gate — only enforced when at least one bound is set
    // and the student has provided their date of birth.
    const ageMin = course.age_min ?? null
    const ageMax = course.age_max ?? null
    if (ageMin !== null || ageMax !== null) {
      if (!profile.date_of_birth) {
        if (requireVerifiableAge) {
          return {
            ok: false, skipped: true, reason: 'age_unverifiable',
            message: 'Age could not be verified for this course.',
          }
        }
        // enrollSelf() parity: an existing user with no DOB on file falls
        // through ungated, as before this refactor.
      } else {
        const dob = new Date(profile.date_of_birth)
        const now = Date.now()
        const age = Math.floor((now - dob.getTime()) / (365.25 * 24 * 3600 * 1000))
        if (ageMin !== null && age < ageMin) {
          return { ok: false, skipped: true, reason: 'age_out_of_range', message: `This course is for ages ${ageMin}+.` }
        }
        if (ageMax !== null && age > ageMax) {
          return { ok: false, skipped: true, reason: 'age_out_of_range', message: `This course is for ages up to ${ageMax}.` }
        }
      }
    }
  }

  // org_id is deliberately omitted here — the trg_stamp_enrollment_org_id
  // trigger (COUNCIL-2026-026 Prompt A) fills it from profile_roles, so the
  // fix applies uniformly to every insert path (session-bound and
  // service-client) rather than relying on each call site to set it.
  const { error } = await supabase
    .from('enrollments')
    .insert({
      user_id:          profile.uid,
      course_id:        courseId,
      transit_status:   'not_started',
      progress_percent: 0,
    })

  if (error) {
    if (error.code === '23505') return { ok: false, skipped: false, error: 'Already enrolled' }
    return { ok: false, skipped: false, error: error.message }
  }

  return { ok: true, courseTitle: course?.title }
}
