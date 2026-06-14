import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import EnrollTable from './EnrollTable'

export const dynamic = 'force-dynamic'

export default async function CourseEnrollPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

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

  // Teachers can only manage their own courses
  if (profile.role === 'teacher' && course.owner_id !== profile.uid) {
    redirect('/dashboard')
  }

  // Fetch all students with their enrollment status for this course
  const [{ data: allStudents }, { data: enrolled }] = await Promise.all([
    supabase
      .from('profiles')
      .select('uid, display_name, email, current_level')
      .eq('role', 'student')
      .order('display_name', { ascending: true }),

    supabase
      .from('enrollments')
      .select('user_id, transit_status, progress_percent')
      .eq('course_id', courseId),
  ])

  const enrollmentMap = Object.fromEntries(
    (enrolled ?? []).map((e) => [e.user_id, e])
  )

  const students = (allStudents ?? []).map((s) => {
    const enr = enrollmentMap[s.uid]
    return {
      uid:              s.uid,
      display_name:     s.display_name,
      email:            s.email,
      current_level:    s.current_level ?? 1,
      enrolled:         !!enr,
      transit_status:   enr?.transit_status  ?? undefined,
      progress_percent: enr?.progress_percent ?? undefined,
    }
  })

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link
            href={`/courses/${courseId}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← {course.title}
          </Link>
          <div className="flex items-center justify-between mt-1">
            <h1 className="text-2xl font-extrabold text-foreground">Manage Enrollment</h1>
            <div className="flex gap-2">
              <Link
                href={`/courses/${courseId}/submissions`}
                className="text-xs font-semibold text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
              >
                Submissions
              </Link>
              <Link
                href={`/courses/${courseId}/analytics`}
                className="text-xs font-semibold text-muted-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-white transition-colors"
              >
                Analytics
              </Link>
            </div>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Search and enroll or unenroll students in <strong>{course.title}</strong>.
          </p>
        </div>

        <EnrollTable courseId={courseId} initialStudents={students} />
      </div>
    </main>
  )
}
