'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

async function assertOrgAdmin(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || profile.org_id !== orgId || !['admin', 'manager'].includes(profile.role ?? '')) {
    throw new Error('Forbidden')
  }
}

// Allows either an org admin/manager of the target org, or a platform admin
// managing any org (COUNCIL-2026-026 D3/Prompt B) — mirrors the
// assertPlatformAdmin() shape in src/app/platform/actions.ts.
async function assertOrgAdminOrPlatformAdmin(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (isPlatformAdmin) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || profile.org_id !== orgId || !['admin', 'manager'].includes(profile.role ?? '')) {
    throw new Error('Forbidden')
  }
}

const AUTO_ENROLL_MAX = 10

export async function getAutoEnrollCourses(orgId: string): Promise<string[]> {
  await assertOrgAdminOrPlatformAdmin(orgId)
  const service = createServiceClient()

  const { data } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const list = (data?.settings as { auto_enroll_courses?: unknown } | null)?.auto_enroll_courses
  return Array.isArray(list) ? (list as string[]) : []
}

export async function addAutoEnrollCourse(orgId: string, courseId: string): Promise<{ error?: string }> {
  await assertOrgAdminOrPlatformAdmin(orgId)
  const service = createServiceClient()

  // Cross-tenant guard: a course ID from another org must never enter this
  // org's auto_enroll_courses list — every future registrant would otherwise
  // get an enrollments row (org_id correctly stamped to their own org) whose
  // course_id points at a foreign org, a real tenant-isolation violation.
  const { data: course } = await service
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!course) return { error: 'Course not found in this organization.' }

  // Atomic add — add_auto_enroll_course() does the read-check-write as a
  // single statement under SELECT ... FOR UPDATE, so two concurrent admin
  // actions on the same org can't silently clobber each other's change (the
  // same race already fixed for platform_feedback's dedupe path).
  const { error } = await service.rpc('add_auto_enroll_course', {
    p_org_id:    orgId,
    p_course_id: courseId,
    p_max:       AUTO_ENROLL_MAX,
  })

  if (error) {
    if (error.message?.includes('auto_enroll_cap_exceeded')) {
      return { error: `You can auto-enroll at most ${AUTO_ENROLL_MAX} courses.` }
    }
    return { error: 'Failed to update auto-enroll courses' }
  }

  revalidatePath('/admin/settings')
  return {}
}

export async function removeAutoEnrollCourse(orgId: string, courseId: string): Promise<{ error?: string }> {
  await assertOrgAdminOrPlatformAdmin(orgId)
  const service = createServiceClient()

  const { error } = await service.rpc('remove_auto_enroll_course', {
    p_org_id:    orgId,
    p_course_id: courseId,
  })

  if (error) return { error: 'Failed to update auto-enroll courses' }

  revalidatePath('/admin/settings')
  return {}
}

// COUNCIL-2026-027 D3 — opt-in per course, admin/manager only (never a
// teacher, even a teacher who owns the course being toggled). Enabling
// requires the course to already be status = 'published'; the DB-level
// CHECK constraint (courses_preview_requires_published, added in
// 20260920200000_public_course_preview.sql) enforces this atomically
// regardless of what this function does, closing any window where the flag
// and status could briefly disagree under concurrent writes.
export async function setCoursePublicPreview(courseId: string, enable: boolean): Promise<{ error?: string }> {
  const service = createServiceClient()

  const { data: course } = await service
    .from('courses')
    .select('id, org_id, status')
    .eq('id', courseId)
    .maybeSingle()

  if (!course) return { error: 'Course not found.' }

  // assertOrgAdminOrPlatformAdmin throws for anyone but an admin/manager of
  // this course's org, or a platform admin — this also rejects a cross-org
  // write attempt, since the caller's own org_id must match course.org_id.
  await assertOrgAdminOrPlatformAdmin(course.org_id)

  if (enable && course.status !== 'published') {
    return { error: 'Only a published course can be marked as a public preview.' }
  }

  // Re-check status = 'published' in the WHERE clause when enabling so a
  // concurrent unpublish is caught here even before the DB CHECK constraint
  // would reject it.
  let query = service.from('courses').update({ is_public_preview: enable }).eq('id', courseId)
  if (enable) query = query.eq('status', 'published')
  const { data: updated, error } = await query.select('id')

  if (error) return { error: 'Failed to update public preview setting.' }
  if (enable && (!updated || updated.length === 0)) {
    return { error: 'Only a published course can be marked as a public preview.' }
  }

  revalidatePath(`/courses/${courseId}/edit`)
  return {}
}

export async function updateOrgBranding(orgId: string, formData: FormData) {
  await assertOrgAdmin(orgId)
  const service = createServiceClient()

  const { data: existing } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    branding: {
      ...(existing?.settings?.branding ?? {}),
      logo_url:        (formData.get('logo_url') as string) || undefined,
      primary_color:   (formData.get('primary_color') as string) || undefined,
      email_from_name: (formData.get('email_from_name') as string) || undefined,
    },
  }

  await service
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
}
