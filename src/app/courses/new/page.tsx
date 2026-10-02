import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CourseForm from '@/components/courses/CourseForm'

export default async function NewCoursePage({
  searchParams,
}: {
  searchParams?: Promise<{ blueprint_id?: string }>
}) {
  const { blueprint_id } = (await searchParams) ?? {}
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  const [existingCoursesResult, blueprintsResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title')
      .eq('owner_id', profile?.uid)
      .order('title', { ascending: true }),
    supabase
      .from('course_blueprints')
      .select('id, title, description, course_code, program_tracks(name, code)')
      .eq('is_active', true)
      .order('title', { ascending: true }),
  ])

  let selectedBp = blueprint_id
    ? blueprintsResult.data?.find((b) => b.id === blueprint_id)
    : null

  if (blueprint_id && !selectedBp) {
    const { data: directBp } = await supabase
      .from('course_blueprints')
      .select('id, title, description, course_code, program_tracks(name, code)')
      .eq('id', blueprint_id)
      .maybeSingle()
    selectedBp = directBp
  }

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-2xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/courses" className="hover:text-amber-300 transition-colors font-medium">Courses</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">New Course</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-display font-extrabold text-white tracking-tight">New Course</h1>
          <p className="text-slate-400 mt-1 text-sm">
            {selectedBp
              ? `Creating a course initialized from blueprint ${selectedBp.course_code}: ${selectedBp.title}.`
              : 'Fill in the details. You can add modules after saving.'}
          </p>
        </div>

        <div className="card-crisp p-8">
          <CourseForm
            userId={profile?.uid ?? ''}
            existingCourses={existingCoursesResult.data ?? []}
            blueprints={blueprintsResult.data ?? []}
            initialBlueprintId={selectedBp?.id ?? null}
            initialTitle={selectedBp?.title ?? ''}
            initialDescription={selectedBp?.description ?? ''}
          />
        </div>
      </div>
    </main>
  )
}

