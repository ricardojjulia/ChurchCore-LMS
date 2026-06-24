import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ProgramTrackForm from '../new/ProgramTrackForm'
import TrackCourseList from './TrackCourseList'
import AddCourseToTrackForm from './AddCourseToTrackForm'

export const dynamic = 'force-dynamic'

export default async function EditProgramTrackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: trackId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [trackResult, trackCoursesResult, allCoursesResult] = await Promise.all([
    supabase
      .from('program_tracks')
      .select('id, name, code, description, is_active')
      .eq('id', trackId)
      .single(),

    supabase
      .from('program_track_courses')
      .select('course_id, sequence_order, is_required, courses(id, title, status)')
      .eq('track_id', trackId)
      .order('sequence_order', { ascending: true }),

    supabase
      .from('courses')
      .select('id, title, status')
      .order('title', { ascending: true }),
  ])

  const track = trackResult.data
  if (!track) notFound()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase join returns array shape; we cast to our component prop type
  const trackCourses = (trackCoursesResult.data ?? []) as unknown as {
    course_id: string
    sequence_order: number
    is_required: boolean
    courses: { id: string; title: string; status: string } | null
  }[]

  const allCourses = allCoursesResult.data ?? []

  const trackCourseIds = new Set(trackCourses.map((tc) => tc.course_id))
  const availableCourses = allCourses.filter((c) => !trackCourseIds.has(c.id))

  const maxOrder = trackCourses.reduce<number>(
    (max, tc) => (tc.sequence_order > max ? tc.sequence_order : max),
    0,
  )
  const nextSequenceOrder = maxOrder + 1

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <nav className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/admin/program-tracks" className="hover:text-primary font-medium">
            Program Tracks
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{track.name}</span>
        </nav>

        {/* Edit track details */}
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-extrabold text-foreground">Edit Program Track</h1>
            <span className="text-xs font-mono text-muted-foreground bg-slate-100 px-2 py-1 rounded">
              {track.code}
            </span>
          </div>
          <ProgramTrackForm
            mode="edit"
            trackId={trackId}
            initial={{
              name: track.name,
              code: track.code,
              description: track.description,
              is_active: track.is_active,
            }}
          />
        </div>

        {/* Required Courses section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-foreground">Required Courses</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Courses assigned to this track, in order. A diploma is awarded when all required
                courses are completed.
              </p>
            </div>
            <span className="text-sm text-muted-foreground font-medium">
              {trackCourses.length}{' '}
              {trackCourses.length === 1 ? 'course' : 'courses'}
            </span>
          </div>

          {/* Course list */}
          <TrackCourseList trackId={trackId} trackCourses={trackCourses} />

          {/* Add course form */}
          <div className="bg-white border border-border rounded-2xl p-6 shadow-sm mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Add Course</h3>
            <AddCourseToTrackForm
              trackId={trackId}
              availableCourses={availableCourses}
              nextSequenceOrder={nextSequenceOrder}
            />
          </div>
        </section>
      </div>
    </main>
  )
}
