import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import AttendanceManager from '@/components/attendance/AttendanceManager'

export const dynamic = 'force-dynamic'

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) redirect('/dashboard')

  const { data: course } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId)
    .single()
  if (!course) notFound()

  // Attendance blocks for this course
  const { data: attendanceBlocks } = await supabase
    .from('course_blocks')
    .select('id, title, content, sort_order')
    .eq('course_id', courseId)
    .eq('block_type_id', 'attendance')
    .order('sort_order', { ascending: true })

  const blocks = attendanceBlocks ?? []

  // Enrolled students (join with profiles via user_id = auth_id)
  const { data: enrollmentRows } = await supabase
    .from('course_enrollments')
    .select('id, user_id, profiles!inner(uid, first_name, last_name, email)')
    .eq('course_id', courseId)
    .eq('role', 'student')
    .eq('status', 'active')
    .order('enrolled_at', { ascending: true })

  type EnrollmentRow = {
    id:       string
    user_id:  string
    profiles: { uid: string; first_name: string | null; last_name: string | null; email: string | null }
  }
  const enrollments = (enrollmentRows ?? []) as unknown as EnrollmentRow[]

  // All submissions for attendance blocks in this course
  const blockIds = blocks.map((b) => b.id)
  const { data: submissionRows } = blockIds.length > 0
    ? await supabase
        .from('block_submissions')
        .select('id, block_id, enrollment_id, content, score, max_score, status')
        .in('block_id', blockIds)
    : { data: [] }

  const submissions = (submissionRows ?? []) as Array<{
    id:           string
    block_id:     string
    enrollment_id: string
    content:      Record<string, unknown>
    score:        number | null
    max_score:    number | null
    status:       string
  }>

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link href="/courses" className="hover:text-primary transition-colors font-medium">Courses</Link>
          <span>/</span>
          <Link href={`/courses/${courseId}`} className="hover:text-primary transition-colors font-medium">
            {course.title}
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Attendance</span>
        </nav>

        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {blocks.length} session{blocks.length !== 1 ? 's' : ''} · {enrollments.length} student{enrollments.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link
            href={`/courses/${courseId}/build`}
            className="text-sm font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
          >
            ✏️ Add Sessions in Builder
          </Link>
        </div>

        {blocks.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">🗓️</p>
            <p className="font-semibold text-foreground">No attendance blocks yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Add an Attendance block in the course builder to start tracking.
            </p>
            <Link
              href={`/courses/${courseId}/build`}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-primary/90 transition-colors"
            >
              Open Builder →
            </Link>
          </div>
        ) : (
          <AttendanceManager
            courseId={courseId}
            blocks={blocks.map((b) => ({
              id:          b.id,
              title:       b.title,
              sessionTitle: (b.content as Record<string, unknown>).session_title as string | null ?? null,
              trackingMode: ((b.content as Record<string, unknown>).tracking_mode as string) ?? 'both',
              points:      ((b.content as Record<string, unknown>).points_possible as number) ?? 0,
            }))}
            enrollments={enrollments.map((e) => ({
              id:          e.id,
              authUserId:  e.user_id,
              displayName: [e.profiles.first_name, e.profiles.last_name].filter(Boolean).join(' ') || e.profiles.email || 'Student',
            }))}
            initialSubmissions={submissions.map((s) => ({
              id:           s.id,
              blockId:      s.block_id,
              enrollmentId: s.enrollment_id,
              status:       (s.content?.attendance_status as string) ?? null,
              score:        s.score,
              maxScore:     s.max_score,
            }))}
          />
        )}
      </div>
    </main>
  )
}
