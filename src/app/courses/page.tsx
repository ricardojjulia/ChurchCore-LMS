import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { Button } from '@/components/ui/button'
import CourseCard from '@/components/lms/CourseCard'

export const dynamic = 'force-dynamic'

export default async function CoursesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  const role    = profile?.role ?? 'student'
  const uid     = profile?.uid  ?? ''
  const isStaff = ['teacher', 'admin', 'manager'].includes(role)

  // Course query: admins/managers see all; teachers see their own; students see published
  let coursesQuery = supabase
    .from('courses')
    .select('id, title, description, status, min_required_level, owner_id')
    .order('created_at', { ascending: false })

  if (role === 'teacher') {
    coursesQuery = coursesQuery.eq('owner_id', uid)
  } else if (!isStaff) {
    // students
    coursesQuery = coursesQuery.eq('status', 'published')
  }
  // admin / manager: no extra filter → see all

  const { data: courses } = await coursesQuery

  // For students: fetch their enrollments so we can show progress on each card
  let enrollmentMap: Record<string, { transit_status: string; progress_percent: number }> = {}
  if (!isStaff && uid) {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('course_id, transit_status, progress_percent')
      .eq('user_id', uid)
    for (const e of enrollments ?? []) {
      enrollmentMap[e.course_id] = {
        transit_status:   e.transit_status,
        progress_percent: e.progress_percent ?? 0,
      }
    }
  }

  const courseList = courses ?? []

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight">
              {isStaff ? (role === 'teacher' ? 'My Courses' : 'All Courses') : 'Course Catalog'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isStaff
                ? role === 'teacher'
                  ? 'Courses you own. Publish when ready for students.'
                  : 'All courses on the platform.'
                : `${courseList.length} course${courseList.length !== 1 ? 's' : ''} available`}
            </p>
          </div>
          {['teacher', 'admin', 'manager'].includes(role) && (
            <Button asChild>
              <Link href="/courses/new">+ New Course</Link>
            </Button>
          )}
        </div>

        {courseList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {courseList.map((course) => {
              const enrollment = enrollmentMap[course.id]
              const isEnrolled = !!enrollment

              const enrollmentBadge = isEnrolled ? (
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className={
                      enrollment.transit_status === 'completed' ? 'text-emerald-600 font-semibold'
                      : enrollment.transit_status === 'in_progress' ? 'text-sky-600 font-semibold'
                      : 'text-slate-500'
                    }>
                      {enrollment.transit_status === 'completed' ? 'Completed'
                       : enrollment.transit_status === 'in_progress' ? 'In progress'
                       : 'Enrolled'}
                    </span>
                    <span>{enrollment.progress_percent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        enrollment.transit_status === 'completed' ? 'bg-emerald-500' : 'bg-primary'
                      }`}
                      style={{ width: `${enrollment.progress_percent}%` }}
                    />
                  </div>
                </div>
              ) : null

              const staffActions = isStaff ? (
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href={`/courses/${course.id}/edit`}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/courses/${course.id}/build`}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Build
                  </Link>
                  <Link
                    href={`/courses/${course.id}/analytics`}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Analytics
                  </Link>
                  <Link
                    href={`/courses/${course.id}/submissions`}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Grades
                  </Link>
                </div>
              ) : enrollmentBadge

              return (
                <CourseCard
                  key={course.id}
                  id={course.id}
                  title={course.title}
                  description={course.description}
                  status={(course as any).status ?? 'draft'}
                  minRequiredLevel={course.min_required_level}
                  showStatus={isStaff}
                  actions={staffActions}
                />
              )
            })}
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-12 text-center">
            <p className="text-muted-foreground italic mb-4">
              {isStaff ? 'No courses yet.' : 'No courses available yet.'}
            </p>
            {isStaff && (
              <Button asChild>
                <Link href="/courses/new">Create your first course</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
