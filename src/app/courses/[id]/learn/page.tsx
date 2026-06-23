import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import LearningShell from '@/components/learning/LearningShell'
import type { CourseBlock } from '@/types/blocks'

export const dynamic = 'force-dynamic'

export default async function LearnPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ block?: string }>
}) {
  const { id: courseId } = await params
  const { block: initialBlockId = null } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)

  // Verify enrollment (or staff override)
  if (!isStaff) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id, transit_status, progress_percent')
      .eq('user_id',   profile.uid)
      .eq('course_id', courseId)
      .single()

    if (!enrollment) redirect(`/courses/${courseId}`)
  }

  // Get enrollment for progress
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('transit_status, progress_percent')
    .eq('user_id',   profile.uid)
    .eq('course_id', courseId)
    .maybeSingle()

  const [courseResult, blocksResult, pagesResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, org_id')
      .eq('id', courseId)
      .single(),
    supabase
      .from('course_blocks')
      .select('*')
      .eq('course_id', courseId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('content_pages')
      .select('id, title, body')
      .eq('course_id', courseId)
      .eq('status', 'published')
      .order('sort_order', { ascending: true }),
  ])

  const course = courseResult.data
  if (!course) notFound()

  const blocks      = (blocksResult.data ?? []) as CourseBlock[]
  const contentPages = (pagesResult.data ?? []) as { id: string; title: string; body: object }[]

  // Get student's submissions for this course's blocks
  const activityBlockIds = blocks
    .filter((b) => b.block_type_id === 'assignment' || b.block_type_id === 'quiz')
    .map((b) => b.id)

  const { data: subData } = activityBlockIds.length > 0
    ? await supabase
        .from('block_submissions')
        .select('block_id, status, content, score, max_score, grade_pct, feedback')
        .eq('user_id', profile.uid)
        .in('block_id', activityBlockIds)
        .eq('is_deleted', false)
        .order('submitted_at', { ascending: false })
    : { data: [] }

  // Deduplicate: one submission per block (latest)
  const seenBlocks = new Set<string>()
  const submissions = (subData ?? [])
    .filter((s) => {
      if (seenBlocks.has(s.block_id)) return false
      seenBlocks.add(s.block_id)
      return true
    })
    .map((s) => ({ ...s, blockId: s.block_id }))

  // Build module list from module_header blocks
  const modules = blocks
    .filter((b) => b.block_type_id === 'module_header')
    .map((b) => ({ id: b.id, title: b.title }))

  return (
    <LearningShell
      courseId={courseId}
      courseTitle={course.title}
      orgId={course.org_id}
      modules={modules}
      blocks={blocks}
      contentPages={contentPages}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase select shape doesn't match LearningShell prop type
      submissions={submissions as any}
      initialBlockId={initialBlockId}
      progressPercent={enrollment?.progress_percent ?? 0}
      isStaff={isStaff}
      viewerRole={profile.role}
    />
  )
}
