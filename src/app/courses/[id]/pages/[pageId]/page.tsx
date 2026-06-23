import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { tiptapToHtml } from '@/utils/tiptap'

export const dynamic = 'force-dynamic'

export default async function MaterialViewerPage({
  params,
}: {
  params: Promise<{ id: string; pageId: string }>
}) {
  const { id: courseId, pageId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)

  // Staff redirect to editor; this route is for read-only viewing
  if (isStaff) redirect(`/courses/${courseId}/pages/${pageId}/edit`)

  // Students must be enrolled
  const { data: enrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('user_id', profile.uid)
    .eq('course_id', courseId)
    .maybeSingle()
  if (!enrollment) redirect(`/courses/${courseId}`)

  const { data: page } = await supabase
    .from('content_pages')
    .select('id, title, body, status, published_at')
    .eq('id', pageId)
    .eq('course_id', courseId)
    .eq('status', 'published')
    .single()

  if (!page) notFound()

  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .single()

  const html = tiptapToHtml(page.body as object)

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/courses" className="hover:text-primary transition-colors">Courses</Link>
          <span>/</span>
          <Link href={`/courses/${courseId}`} className="hover:text-primary transition-colors truncate max-w-[8rem]">
            {course?.title}
          </Link>
          <span>/</span>
          <Link href={`/courses/${courseId}/pages`} className="hover:text-primary transition-colors">
            Additional Materials
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold truncate">{page.title}</span>
        </nav>

        <article className="bg-white border border-border rounded-2xl px-8 py-8 shadow-sm">
          <header className="mb-6 pb-6 border-b border-border">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <span aria-hidden="true">📄</span>
              <span className="uppercase tracking-wide font-medium">Additional Material</span>
              {page.published_at && (
                <>
                  <span>·</span>
                  <span>
                    {new Date(page.published_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </>
              )}
            </div>
            <h1 className="text-2xl font-extrabold text-foreground tracking-tight">{page.title}</h1>
          </header>

          <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
            {html
              ? <div dangerouslySetInnerHTML={{ __html: html }} />
              : <p className="italic text-muted-foreground">No content.</p>
            }
          </div>
        </article>

        <div className="mt-6 text-center">
          <Link
            href={`/courses/${courseId}/pages`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Additional Materials
          </Link>
        </div>
      </div>
    </main>
  )
}
