import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CourseForm from '@/components/courses/CourseForm'

export default async function EditCoursePage({ params }: { params: { id: string } }) {
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

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') redirect('/dashboard')

  const [courseResult, allCoursesResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, description, status, min_required_level, prerequisite_course_id, owner_id')
      .eq('id', params.id)
      .single(),
    supabase
      .from('courses')
      .select('id, title')
      .eq('owner_id', profile?.uid)
      .order('title', { ascending: true }),
  ])

  const course = courseResult.data
  if (!course) notFound()
  if (course.owner_id !== profile?.uid && profile?.role !== 'admin') redirect('/courses')

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/courses" className="hover:text-indigo-600 transition-colors font-medium">Courses</Link>
          <span>/</span>
          <Link href={`/courses/${params.id}`} className="hover:text-indigo-600 transition-colors font-medium truncate">{course.title}</Link>
          <span>/</span>
          <span className="text-slate-700 font-semibold">Edit</span>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Edit Course</h1>
          <p className="text-slate-500 mt-1 text-sm">{course.title}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <CourseForm
            userId={profile?.uid ?? ''}
            courseId={course.id}
            existingCourses={allCoursesResult.data ?? []}
            initialTitle={course.title}
            initialDescription={course.description ?? ''}
            initialLevel={course.min_required_level}
            initialPrerequisiteId={course.prerequisite_course_id}
            initialStatus={course.status}
          />
        </div>
      </div>
    </main>
  )
}
