import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getTranslations } from 'next-intl/server'
import CourseMaterialsList, { type MaterialPageItem } from '@/components/materials/CourseMaterialsList'

export const dynamic = 'force-dynamic'

export default async function CourseMaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const t = await getTranslations()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)

  // Students must be enrolled
  if (!isStaff) {
    const { data: enrollment } = await supabase
      .from('enrollments')
      .select('id')
      .eq('user_id', profile.uid)
      .eq('course_id', courseId)
      .maybeSingle()
    if (!enrollment) redirect(`/courses/${courseId}`)
  }

  const [{ data: course }, { data: pages }] = await Promise.all([
    supabase.from('courses').select('id, title').eq('id', courseId).single(),
    supabase
      .from('content_pages')
      .select('id, title, status, updated_at, published_at, embedding_status')
      .eq('course_id', courseId)
      .neq('status', 'archived')
      // Students only see published; staff see all
      .then((res) => {
        if (!isStaff && res.data) {
          return { ...res, data: res.data.filter((p) => p.status === 'published') }
        }
        return res
      })
      .then((res) => ({ ...res, data: res.data?.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) ?? [] })),
  ])

  if (!course) redirect('/courses')

  const materialPages = (pages ?? []) as MaterialPageItem[]

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/courses" className="hover:text-amber-300 transition-colors">{t('courses.detail.coursescrumb')}</Link>
          <span>/</span>
          <Link href={`/courses/${courseId}`} className="hover:text-amber-300 transition-colors truncate">
            {course.title}
          </Link>
          <span>/</span>
          <span className="text-white font-semibold">{t('courses.materials.breadcrumbCurrent')}</span>
        </nav>

        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-white">{t('courses.materials.heading')}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {t('courses.materials.subheading')}
          </p>
        </div>

        <CourseMaterialsList
          courseId={courseId}
          courseTitle={course.title}
          isStaff={isStaff}
          initialPages={materialPages}
        />
      </div>
    </main>
  )
}
