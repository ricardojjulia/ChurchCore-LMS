import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import CourseCard from '@/components/lms/CourseCard'

export const dynamic = 'force-dynamic'

type Blueprint = {
  course_code: string
  title: string
  program_track_id: string | null
  track: { id: string; name: string; code: string } | null
}

type CourseRow = {
  id: string
  title: string
  description: string | null
  status: 'draft' | 'published' | 'archived' | 'suspended'
  min_required_level: number | null
  owner_id: string | null
  blueprint: Blueprint | null
}

type TrackGroup = { id: string | null; name: string; courses: CourseRow[] }

function groupByTrack(courseList: CourseRow[]): TrackGroup[] {
  const map = new Map<string | null, TrackGroup>()
  for (const course of courseList) {
    const track = course.blueprint?.track ?? null
    const key = track?.id ?? null
    if (!map.has(key)) map.set(key, { id: key, name: track?.name ?? 'Other', courses: [] })
    map.get(key)!.courses.push(course)
  }
  return [...map.values()].sort((a, b) =>
    a.id === null ? 1 : b.id === null ? -1 : a.name.localeCompare(b.name),
  )
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string }>
}) {
  const { track: activeTrack } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  const role    = profile?.role ?? 'student'
  const uid     = profile?.uid  ?? ''
  const isStaff = ['teacher', 'admin', 'manager'].includes(role)

  let coursesQuery = supabase
    .from('courses')
    .select(`
      id, title, description, status, min_required_level, owner_id,
      blueprint:course_blueprints(
        course_code, title, program_track_id,
        track:program_tracks(id, name, code)
      )
    `)
    .order('created_at', { ascending: false })

  if (role === 'teacher') {
    coursesQuery = coursesQuery.eq('owner_id', uid)
  } else if (!isStaff) {
    coursesQuery = coursesQuery.eq('status', 'published')
  }

  const [{ data: courses }, { data: allTracks }] = await Promise.all([
    coursesQuery,
    supabase
      .from('program_tracks')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name'),
  ])

  const courseList = (courses ?? []) as unknown as CourseRow[]

  // For students: fetch enrollments for progress display
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

  const tracksWithCourses = (allTracks ?? []).filter((t) =>
    courseList.some((c) => c.blueprint?.track?.id === t.id),
  )
  const showTrackFilter = tracksWithCourses.length >= 2

  const filtered = activeTrack
    ? courseList.filter((c) => c.blueprint?.track?.id === activeTrack)
    : courseList

  const activeTrackName = activeTrack
    ? (tracksWithCourses.find((t) => t.id === activeTrack)?.name ?? null)
    : null

  const groups = groupByTrack(filtered)

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
                : activeTrack
                ? `Showing ${filtered.length} course${filtered.length !== 1 ? 's' : ''} in this track`
                : `${courseList.length} course${courseList.length !== 1 ? 's' : ''} available`}
            </p>
          </div>
          {['teacher', 'admin', 'manager'].includes(role) && (
            <Button asChild>
              <Link href="/courses/new">+ New Course</Link>
            </Button>
          )}
        </div>

        {showTrackFilter && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Link
              href="/courses"
              className={cn(
                'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors',
                !activeTrack
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              All Tracks
            </Link>
            {tracksWithCourses.map((track) => (
              <Link
                key={track.id}
                href={`?track=${track.id}`}
                className={cn(
                  'text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors',
                  activeTrack === track.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {track.name}
              </Link>
            ))}
          </div>
        )}

        {filtered.length > 0 ? (
          <>
            {activeTrackName && (
              <div className="mb-4 flex items-center gap-2">
                <Link
                  href="/courses"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  ← All tracks
                </Link>
                <span className="text-muted-foreground">·</span>
                <span className="text-sm font-semibold">{activeTrackName}</span>
              </div>
            )}

            {groups.map((group) => (
              <section key={group.id ?? 'other'} className={groups.length > 1 ? 'mb-10' : undefined}>
                {groups.length > 1 && (
                  <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
                    {group.name}
                  </h2>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.courses.map((course) => {
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
                        <div
                          className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"
                          style={{ '--progress-w': `${enrollment.progress_percent}%` } as React.CSSProperties}
                        >
                          <div
                            className={cn(
                              'h-full rounded-full [width:var(--progress-w)]',
                              enrollment.transit_status === 'completed' ? 'bg-emerald-500' : 'bg-primary',
                            )}
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
                        status={course.status ?? 'draft'}
                        minRequiredLevel={course.min_required_level ?? undefined}
                        showStatus={isStaff}
                        blueprintCode={course.blueprint?.course_code}
                        actions={staffActions}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
          </>
        ) : (
          <div className="bg-white border border-border rounded-xl p-12 text-center">
            <p className="text-muted-foreground italic mb-4">
              {activeTrack
                ? 'No courses in this track.'
                : isStaff
                ? 'No courses yet.'
                : 'No courses available yet.'}
            </p>
            {isStaff && !activeTrack && (
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
