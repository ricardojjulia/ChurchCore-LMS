import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getGradebookGrid } from '@/app/actions/gradebook'
import GradebookGrid from '@/components/lms/GradebookGrid'

export const dynamic = 'force-dynamic'

export default async function GradebookPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: course } = await supabase
    .from('courses')
    .select('id, title, owner_id, org_id')
    .eq('id', courseId)
    .single()

  if (!course) notFound()

  if (course.owner_id !== profile.uid && !['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: rows, error } = await getGradebookGrid(courseId)

  if (error) {
    // The RPC raises "Access denied" for non-owning teachers.
    // Treat any grid fetch error as a not-found so we never render a
    // DB error message in the DOM.
    console.error('[gradebook]', error)
    notFound()
  }

  // Linked guardians of this course's students, for "Message guardian"
  // (COUNCIL-2026-035). Staff can't read guardian_links under RLS, and this
  // page is already limited to the course's teacher and org admins, so the
  // lookup runs server-side for these students only; sending is still
  // checked by the database (can_message_about).
  const studentUids = [...new Set((rows ?? []).map((r) => r.student_uid))]
  const guardiansByStudent: Record<string, Array<{ uid: string; name: string }>> = {}
  if (studentUids.length) {
    const { data: links } = await createServiceClient()
      .from('guardian_links')
      .select('student_uid, guardian_uid, profiles!guardian_links_guardian_uid_fkey(display_name, org_id)')
      .in('student_uid', studentUids)
    for (const l of (links ?? []) as unknown as Array<{ student_uid: string; guardian_uid: string; profiles: { display_name: string | null; org_id: string | null } | null }>) {
      if (l.profiles?.org_id !== course.org_id) continue
      ;(guardiansByStudent[l.student_uid] ??= []).push({ uid: l.guardian_uid, name: l.profiles?.display_name ?? '' })
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/courses/${courseId}/submissions`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Submissions
          </Link>
          <h1 className="text-2xl font-extrabold text-foreground mt-1">Gradebook Grid</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{course.title}</p>
        </div>

        <GradebookGrid
          courseId={courseId}
          courseTitle={course.title}
          initialRows={rows ?? []}
          guardiansByStudent={guardiansByStudent}
        />
      </div>
    </main>
  )
}
