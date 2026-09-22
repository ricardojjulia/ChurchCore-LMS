import { createClient } from '@/utils/supabase/server'
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
    .select('id, title, owner_id')
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

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
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
        />
      </div>
    </main>
  )
}
