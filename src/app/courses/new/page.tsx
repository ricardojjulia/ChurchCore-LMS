import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CourseForm from '@/components/courses/CourseForm'

export default async function NewCoursePage() {
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
      .select('id, title, course_code, program_tracks(name, code)')
      .eq('is_active', true)
      .order('title', { ascending: true }),
  ])

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/courses" className="hover:text-indigo-600 transition-colors font-medium">Courses</Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold">New Course</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">New Course</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Fill in the details. You can add modules after saving.
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <CourseForm
            userId={profile?.uid ?? ''}
            existingCourses={existingCoursesResult.data ?? []}
            blueprints={blueprintsResult.data ?? []}
          />
        </div>
      </div>
    </main>
  )
}
