'use server'

import { createClient } from '@/utils/supabase/server'

type CourseStatus = 'draft' | 'published' | 'archived' | 'suspended'

export interface CreateCourseInput {
  title:                   string
  description?:            string | null
  min_required_level?:     number
  prerequisite_course_id?: string | null
  blueprint_id?:           string | null
  status:                  CourseStatus
}

export async function createCourse(
  input: CreateCourseInput
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthenticated' }

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!pr) return { error: 'Profile not found.' }
  if (!['admin', 'manager', 'teacher'].includes(pr.role)) return { error: 'Forbidden' }

  // org_id is NOT passed here — the BEFORE INSERT trigger stamp_course_org_id
  // sets it from current_user_org_id() so it always matches the RLS WITH CHECK.
  const { data, error } = await supabase
    .from('courses')
    .insert({
      title:                   input.title,
      description:             input.description ?? null,
      min_required_level:      input.min_required_level ?? 1,
      prerequisite_course_id:  input.prerequisite_course_id ?? null,
      blueprint_id:            input.blueprint_id ?? null,
      status:                  input.status,
      owner_id:                pr.uid,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}
