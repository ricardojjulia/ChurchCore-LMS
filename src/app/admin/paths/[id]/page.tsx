// COUNCIL-2026-029: Admin — Edit learning path + manage courses

import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import PathAdminClient from './PathAdminClient'
import type { LearningPathWithCourses } from '@/types/learning-path'

export const dynamic = 'force-dynamic'

export default async function AdminPathDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profile_roles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role ?? '')) {
    redirect('/dashboard')
  }

  // Fetch the path with its courses
  const { data: path, error } = await supabase
    .from('learning_paths')
    .select(`
      id, org_id, title, description, is_published, cover_image_url, created_at, updated_at,
      learning_path_courses (
        id, path_id, course_id, sort_order,
        course:courses ( id, title, description, status )
      )
    `)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .single()

  if (error || !path) notFound()

  // Fetch published courses in this org that could be added to the path
  const existingCourseIds = new Set(
    (path.learning_path_courses as Array<{ course_id: string }>).map((lpc) => lpc.course_id)
  )

  const { data: availableCourses } = await supabase
    .from('courses')
    .select('id, title')
    .eq('org_id', profile.org_id)
    .eq('status', 'published')
    .order('title', { ascending: true })

  const addableCourses = (availableCourses ?? []).filter((c) => !existingCourseIds.has(c.id))

  return (
    <PathAdminClient
      path={path as unknown as LearningPathWithCourses}
      addableCourses={addableCourses}
    />
  )
}
