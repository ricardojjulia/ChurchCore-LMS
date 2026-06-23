import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import CourseBuilder from '@/components/builder/CourseBuilder'
import type { CourseBlock } from '@/types/blocks'

export const dynamic = 'force-dynamic'

export default async function BuildCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  const [courseResult, blocksResult] = await Promise.all([
    supabase
      .from('courses')
      .select('id, title, owner_id, status')
      .eq('id', id)
      .single(),
    supabase
      .from('course_blocks')
      .select('*')
      .eq('course_id', id)
      .order('sort_order', { ascending: true }),
  ])

  const course = courseResult.data
  if (!course) notFound()
  if (course.owner_id !== profile?.uid && profile?.role !== 'admin') redirect('/courses')

  const initialBlocks = (blocksResult.data ?? []) as CourseBlock[]

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-slate-950 flex flex-col">
      <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/courses/${id}`}
            className="text-slate-400 hover:text-white transition-colors text-sm font-medium"
          >
            ← {course.title}
          </Link>
          <span className="text-slate-700">|</span>
          <span className="text-white font-bold text-sm">Course Builder</span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
            course.status === 'published'
              ? 'bg-emerald-900 text-emerald-300'
              : course.status === 'archived'
              ? 'bg-slate-700 text-slate-400'
              : 'bg-amber-900 text-amber-300'
          }`}>
            {course.status.charAt(0).toUpperCase() + course.status.slice(1)}
          </span>
          <Link
            href={`/courses/${id}/edit`}
            className="text-xs text-slate-400 hover:text-white transition-colors font-medium"
          >
            Edit Settings
          </Link>
        </div>
      </header>

      <CourseBuilder courseId={id} initialBlocks={initialBlocks} />
    </div>
  )
}
