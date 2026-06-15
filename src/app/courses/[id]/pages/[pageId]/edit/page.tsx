import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import PageEditor from '@/components/editor/PageEditor'
import RelatedConceptsPanel from '@/components/ai/RelatedConceptsPanel'

export const dynamic = 'force-dynamic'

export default async function PageEditorRoute({
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

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: page, error } = await supabase
    .from('content_pages')
    .select('id, title, body, status, course_id, embedding_status')
    .eq('id', pageId)
    .eq('course_id', courseId)
    .single()

  if (error || !page) notFound()

  const { data: course } = await supabase
    .from('courses')
    .select('title')
    .eq('id', courseId)
    .single()

  return (
    <main id="main-content" className="min-h-screen bg-white">
      <div className="border-b border-border px-4 py-2 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50">
        <span>{course?.title ?? 'Course'}</span>
        <span>/</span>
        <span>Pages</span>
        <span>/</span>
        <span className="font-medium text-foreground truncate">{page.title}</span>
      </div>

      <PageEditor
        pageId={page.id}
        courseId={courseId}
        title={page.title}
        body={(page.body as object) ?? { type: 'doc', content: [] }}
        status={page.status as 'draft' | 'published' | 'archived'}
      />

      {page.status === 'published' && (
        <div className="max-w-3xl mx-auto px-4">
          <RelatedConceptsPanel
            pageId={page.id}
            embeddingStatus={(page.embedding_status as 'pending' | 'processing' | 'complete' | 'failed' | 'stale') ?? null}
          />
        </div>
      )}
    </main>
  )
}
