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

  const { data: existing } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const current = Array.isArray((existing?.settings as { auto_enroll_courses?: unknown } | null)?.auto_enroll_courses)
    ? ((existing!.settings as { auto_enroll_courses: string[] }).auto_enroll_courses)
    : []

  if (current.includes(courseId)) return {}
  if (current.length >= AUTO_ENROLL_MAX) {
    return { error: `You can auto-enroll at most ${AUTO_ENROLL_MAX} courses.` }
  }

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    auto_enroll_courses: [...current, courseId],
  }

  const { error } = await service
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)

  if (error) return { error: 'Failed to update auto-enroll courses' }

  revalidatePath('/admin/settings')
  return {}
}

export async function removeAutoEnrollCourse(orgId: string, courseId: string): Promise<{ error?: string }> {
  await assertOrgAdminOrPlatformAdmin(orgId)
  const service = createServiceClient()

  const { data: existing } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const current = Array.isArray((existing?.settings as { auto_enroll_courses?: unknown } | null)?.auto_enroll_courses)
    ? ((existing!.settings as { auto_enroll_courses: string[] }).auto_enroll_courses)
    : []

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    auto_enroll_courses: current.filter((id) => id !== courseId),
  }

  const { error } = await service
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)

  if (error) return { error: 'Failed to update auto-enroll courses' }

  revalidatePath('/admin/settings')
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
