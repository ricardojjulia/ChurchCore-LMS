import type { SupabaseClient } from '@supabase/supabase-js'
import { enrollCore } from '@/lib/enrollment-core'

// Shared by the password join (src/app/join/actions.ts) and the SSO join
// (/join/[slug]/complete, COUNCIL-2026-037). Service-role client only.
export async function autoEnrollNewJoiner(
  service: SupabaseClient,
  org: { id: string; settings: unknown },
  authId: string,
): Promise<void> {
  // Auto-enroll into any courses this org has configured for new joiners
  // (organizations.settings.auto_enroll_courses, COUNCIL-2026-026 D3). Runs
  // through the same enrollCore() gate as any other enrollment, so an
  // invite-only/cohort-gated/prerequisite-gated course is silently skipped
  // rather than failing. Best-effort — a failure here must never block
  // account creation, which has already succeeded at this point.
  const autoEnrollCourseIds = Array.isArray(
    (org.settings as { auto_enroll_courses?: unknown } | null)?.auto_enroll_courses
  )
    ? ((org.settings as { auto_enroll_courses: string[] }).auto_enroll_courses).slice(0, 10)
    : []

  for (const courseId of autoEnrollCourseIds) {
    try {
      // Defense-in-depth re-check: addAutoEnrollCourse() already validates a
      // course belongs to the org before it can be added, but this list is
      // read here independently at registration time (possibly long after
      // it was configured), so re-confirm both org ownership and published
      // status rather than trusting the stored JSONB entry as-is — a course
      // can be unpublished for revision after being opted into auto-enroll.
      const { data: courseCheck } = await service
        .from('courses')
        .select('id')
        .eq('id', courseId)
        .eq('org_id', org.id)
        .eq('status', 'published')
        .maybeSingle()

      if (!courseCheck) continue

      await enrollCore({
        supabase: service,
        authId:   authId,
        courseId,
        requireVerifiableAge: true,
      })
    } catch {
      // Auto-enrollment failure must never block registration
    }
  }

}
