'use server'

// COUNCIL-2026-029: Learning Paths / Discipleship Tracks

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import type { LearningPath, LearningPathWithProgress } from '@/types/learning-path'

// ─── Auth guard ────────────────────────────────────────────────────────────────

/** Asserts the caller is an admin or manager of the given org (or a platform admin). */
async function assertPathAdmin(orgId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: isPlatformAdmin } = await supabase.rpc('is_platform_admin')
  if (isPlatformAdmin) return

  const { data: profile } = await supabase
    .from('profile_roles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (
    !profile ||
    profile.org_id !== orgId ||
    !['admin', 'manager'].includes(profile.role ?? '')
  ) {
    throw new Error('Forbidden')
  }
}

/** Resolves the org_id for a given learning_path id (or throws if not found / wrong org). */
async function resolvePathOrgId(pathId: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .select('org_id')
    .eq('id', pathId)
    .single()
  if (error || !data) throw new Error('Not found')
  return data.org_id
}

// ─── Path CRUD ─────────────────────────────────────────────────────────────────

export type CreateLearningPathInput = {
  title: string
  description?: string
  cover_image_url?: string
}

export async function createLearningPath(
  orgId: string,
  input: CreateLearningPathInput
): Promise<{ data: LearningPath | null; error: string | null }> {
  if (!input.title?.trim()) return { data: null, error: 'Title is required' }
  if (input.title.length > 200) return { data: null, error: 'Title must be 200 characters or fewer' }

  try {
    await assertPathAdmin(orgId)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .insert({ org_id: orgId, title: input.title.trim(), description: input.description ?? null, cover_image_url: input.cover_image_url ?? null })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  revalidatePath('/admin/paths')
  return { data: data as LearningPath, error: null }
}

export type UpdateLearningPathInput = {
  title?: string
  description?: string | null
  cover_image_url?: string | null
  is_published?: boolean
}

export async function updateLearningPath(
  pathId: string,
  input: UpdateLearningPathInput
): Promise<{ data: LearningPath | null; error: string | null }> {
  if (input.title !== undefined) {
    if (!input.title?.trim()) return { data: null, error: 'Title is required' }
    if (input.title.length > 200) return { data: null, error: 'Title must be 200 characters or fewer' }
  }

  let orgId: string
  try {
    orgId = await resolvePathOrgId(pathId)
    await assertPathAdmin(orgId)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const updates: Record<string, unknown> = {}
  if (input.title !== undefined) updates.title = input.title.trim()
  if ('description' in input) updates.description = input.description
  if ('cover_image_url' in input) updates.cover_image_url = input.cover_image_url
  if (input.is_published !== undefined) updates.is_published = input.is_published

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('learning_paths')
    .update(updates)
    .eq('id', pathId)
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  revalidatePath('/admin/paths')
  revalidatePath(`/admin/paths/${pathId}`)
  revalidatePath('/paths')
  return { data: data as LearningPath, error: null }
}

export async function deleteLearningPath(
  pathId: string
): Promise<{ error: string | null }> {
  let orgId: string
  try {
    orgId = await resolvePathOrgId(pathId)
    await assertPathAdmin(orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('learning_paths')
    .delete()
    .eq('id', pathId)

  if (error) return { error: error.message }
  revalidatePath('/admin/paths')
  revalidatePath('/paths')
  return { error: null }
}

// ─── Course membership ─────────────────────────────────────────────────────────

export async function addCourseToPath(
  pathId: string,
  courseId: string
): Promise<{ error: string | null }> {
  let orgId: string
  try {
    orgId = await resolvePathOrgId(pathId)
    await assertPathAdmin(orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const supabase = await createClient()

  // Verify the course is published and belongs to the same org
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, org_id, status')
    .eq('id', courseId)
    .single()

  if (courseError || !course) return { error: 'Course not found' }
  if (course.org_id !== orgId) return { error: 'Course does not belong to this organization' }
  if (course.status !== 'published') return { error: 'Only published courses can be added to a learning path' }

  // Determine next sort_order
  const { data: maxRow } = await supabase
    .from('learning_path_courses')
    .select('sort_order')
    .eq('path_id', pathId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextOrder = maxRow ? maxRow.sort_order + 1 : 0

  const { error } = await supabase
    .from('learning_path_courses')
    .insert({ path_id: pathId, course_id: courseId, sort_order: nextOrder })

  if (error) return { error: error.message }
  revalidatePath(`/admin/paths/${pathId}`)
  return { error: null }
}

export async function removeCourseFromPath(
  pathId: string,
  courseId: string
): Promise<{ error: string | null }> {
  let orgId: string
  try {
    orgId = await resolvePathOrgId(pathId)
    await assertPathAdmin(orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('learning_path_courses')
    .delete()
    .eq('path_id', pathId)
    .eq('course_id', courseId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/paths/${pathId}`)
  return { error: null }
}

export async function reorderPathCourses(
  pathId: string,
  orderedCourseIds: string[]
): Promise<{ error: string | null }> {
  let orgId: string
  try {
    orgId = await resolvePathOrgId(pathId)
    await assertPathAdmin(orgId)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Forbidden' }
  }

  if (orderedCourseIds.length === 0) return { error: null }

  const supabase = await createClient()

  // Verify all provided course IDs actually belong to this path
  const { data: existing, error: fetchErr } = await supabase
    .from('learning_path_courses')
    .select('course_id')
    .eq('path_id', pathId)

  if (fetchErr) return { error: fetchErr.message }

  const existingIds = new Set(existing?.map((r) => r.course_id) ?? [])
  for (const id of orderedCourseIds) {
    if (!existingIds.has(id)) {
      return { error: `Course ${id} is not in this path` }
    }
  }

  // Update sort_order for each course
  const updates = orderedCourseIds.map((courseId, index) =>
    supabase
      .from('learning_path_courses')
      .update({ sort_order: index })
      .eq('path_id', pathId)
      .eq('course_id', courseId)
  )

  const results = await Promise.all(updates)
  const firstError = results.find((r) => r.error)
  if (firstError?.error) return { error: firstError.error.message }

  revalidatePath(`/admin/paths/${pathId}`)
  return { error: null }
}

// ─── Learner data-fetching (Server Component use only) ────────────────────────

/**
 * Returns all published learning paths for an org, with their published courses
 * and the current learner's completion count derived from course_certificates.
 *
 * Uses the authenticated (user-scoped) Supabase client — RLS is the security boundary.
 */
export async function getLearningPathsForLearner(
  orgId: string
): Promise<LearningPathWithProgress[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // course_certificates.user_id references profiles.uid (the domain UID), not
  // auth.users.id — resolve it via profile_roles before querying certificates.
  const { data: callerProfile } = await supabase
    .from('profile_roles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()
  if (!callerProfile?.uid) return []

  // Fetch published paths with their published courses
  const { data: paths, error } = await supabase
    .from('learning_paths')
    .select(`
      id, org_id, title, description, is_published, cover_image_url, created_at, updated_at,
      learning_path_courses (
        id, path_id, course_id, sort_order,
        course:courses ( id, title, description, status )
      )
    `)
    .eq('org_id', orgId)
    .eq('is_published', true)
    .order('created_at', { ascending: true })

  if (error || !paths) return []

  // Fetch the learner's completed course IDs (one cert per course completion)
  const { data: certs } = await supabase
    .from('course_certificates')
    .select('course_id')
    .eq('user_id', callerProfile.uid)

  const completedCourseIds = new Set(certs?.map((c) => c.course_id) ?? [])

  return paths.map((path) => {
    // Filter to published courses only, sorted by sort_order
    const courses = (path.learning_path_courses as unknown as Array<{
      id: string; path_id: string; course_id: string; sort_order: number;
      course: { id: string; title: string; description: string | null; status: string } | null
    }>)
      .filter((lpc) => lpc.course?.status === 'published')
      .sort((a, b) => a.sort_order - b.sort_order)
    
    const completedCount = courses.filter((lpc) => lpc.course && completedCourseIds.has(lpc.course_id)).length

    return {
      ...path,
      description: path.description ?? null,
      cover_image_url: path.cover_image_url ?? null,
      learning_path_courses: courses.map((lpc) => ({
        id: lpc.id,
        path_id: lpc.path_id,
        course_id: lpc.course_id,
        sort_order: lpc.sort_order,
        created_at: '',
        course: lpc.course!,
      })),
      completedCount,
      totalCount: courses.length,
    }
  })
}
