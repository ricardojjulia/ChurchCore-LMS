import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import TutorChat from '@/components/ai/TutorChat'

export const dynamic = 'force-dynamic'

export default async function TutorPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>
  searchParams: Promise<{ section?: string }>
}) {
  const { id: courseId }    = await params
  const { section: sectionId } = await searchParams

  if (!sectionId) redirect(`/courses/${courseId}`)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()
  if (!profile) redirect('/auth/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)

  // Staff can access any section; students must have an active enrollment
  if (!isStaff) {
    const { data: enrollment } = await supabase
      .from('direct_enrollments')
      .select('id, status')
      .eq('user_id',    user.id)
      .eq('section_id', sectionId)
      .eq('status',     'active')
      .maybeSingle()

    if (!enrollment) redirect(`/courses/${courseId}`)
  }

  // Load section + blueprint info
  const { data: section } = await supabase
    .from('course_sections')
    .select(`
      id, section_code, delivery_format,
      course_blueprints ( id, title, course_code )
    `)
    .eq('id', sectionId)
    .single()

  if (!section) notFound()

  const blueprint = section.course_blueprints as unknown as {
    id: string; title: string; course_code: string
  } | null

  // Check if any published pages are AI-indexed for this section's blueprint
  const { data: pages } = await supabase
    .from('content_pages')
    .select('embedding_status')
    .eq('course_id', blueprint?.id ?? courseId)
    .eq('status',    'published')

  const isIndexed = (pages ?? []).some((p) => p.embedding_status === 'complete')
  const hasPublishedPages = (pages ?? []).length > 0

  return (
    <main id="main-content" className="min-h-screen bg-slate-50">
      {/* Breadcrumb */}
      <nav className="border-b border-border bg-white px-6 py-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/courses" className="hover:text-primary transition-colors">Courses</Link>
        <span>/</span>
        <Link href={`/courses/${courseId}`} className="hover:text-primary transition-colors truncate max-w-[200px]">
          {blueprint?.title ?? courseId}
        </Link>
        <span>/</span>
        <span className="text-foreground font-semibold">AI Tutor</span>
        <span className="ml-auto text-xs font-mono text-muted-foreground">{section.section_code}</span>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* No published pages at all */}
        {!hasPublishedPages && (
          <div className="bg-white border border-border rounded-2xl p-12 text-center shadow-sm">
            <div className="text-4xl mb-4">📄</div>
            <h2 className="text-base font-bold text-foreground mb-2">No published content yet</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              The AI tutor answers questions based on published course pages.
              Once content is published and indexed, you can start asking questions here.
            </p>
            {isStaff && (
              <Link
                href={`/courses/${courseId}/pages`}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors"
              >
                Go to Pages →
              </Link>
            )}
          </div>
        )}

        {/* Has pages — show the chat */}
        {hasPublishedPages && (
          <div className="bg-white border border-border rounded-2xl shadow-sm overflow-hidden"
               style={{ height: 'calc(100vh - 200px)', minHeight: '520px' }}>
            <TutorChat
              sectionId={sectionId}
              courseId={courseId}
              courseTitle={blueprint?.title ?? 'Course'}
              isIndexed={isIndexed}
            />
          </div>
        )}

        {/* Section metadata — unobtrusive footer */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Section {section.section_code}
          {blueprint?.course_code ? ` · ${blueprint.course_code}` : ''}
          {' · AI answers are based on published course content only'}
        </p>
      </div>
    </main>
  )
}
