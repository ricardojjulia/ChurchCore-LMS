import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { createPageAndRedirect } from '@/app/actions/content'

export const dynamic = 'force-dynamic'

export default async function CourseMaterialsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
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

  const STATUS_STYLE = {
    published: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    draft:     'text-amber-700 bg-amber-50 border-amber-200',
    archived:  'text-slate-500 bg-slate-50 border-slate-200',
  }

  const EMBED_BADGE: Record<string, { label: string; className: string }> = {
    complete:   { label: 'AI Ready',  className: 'text-violet-700 bg-violet-50 border-violet-200' },
    pending:    { label: 'Indexing',  className: 'text-slate-500 bg-slate-100 border-slate-200' },
    processing: { label: 'Indexing',  className: 'text-slate-500 bg-slate-100 border-slate-200' },
    stale:      { label: 'Stale',     className: 'text-slate-500 bg-slate-100 border-slate-200' },
    failed:     { label: 'Index failed', className: 'text-rose-600 bg-rose-50 border-rose-200' },
  }

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link href="/courses" className="hover:text-primary transition-colors">Courses</Link>
          <span>/</span>
          <Link href={`/courses/${courseId}`} className="hover:text-primary transition-colors truncate">
            {course.title}
          </Link>
          <span>/</span>
          <span className="text-foreground font-semibold">Additional Materials</span>
        </nav>

        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Additional Materials</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isStaff
                ? 'Supplementary reading and reference pages for this course.'
                : 'Supplementary reading and reference pages from your instructor.'}
            </p>
          </div>

          {isStaff && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground hidden sm:block">
                Published materials are visible to enrolled students.
              </p>
              <form action={createPageAndRedirect.bind(null, courseId)}>
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors"
                >
                  + New Material
                </button>
              </form>
            </div>
          )}
        </div>

        {(!pages || pages.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">📚</p>
            <h2 className="text-base font-bold text-foreground mb-1">
              {isStaff ? 'No materials yet' : 'No materials available'}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {isStaff
                ? 'Create supplementary reading pages and publish them to make them visible to students.'
                : 'Your instructor hasn\'t published any additional materials for this course yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pages.map((p) => {
              const style      = STATUS_STYLE[p.status as keyof typeof STATUS_STYLE] ?? STATUS_STYLE.draft
              const embedBadge = p.status === 'published'
                ? (EMBED_BADGE[p.embedding_status ?? 'pending'] ?? EMBED_BADGE.pending)
                : null
              // Staff go to edit; students go to read-only viewer
              const href = isStaff
                ? `/courses/${courseId}/pages/${p.id}/edit`
                : `/courses/${courseId}/pages/${p.id}`
              return (
                <Link
                  key={p.id}
                  href={href}
                  className="flex items-center gap-4 bg-white border border-border rounded-xl px-5 py-4 hover:shadow-sm hover:border-primary/30 transition-all group"
                >
                  <span className="text-xl shrink-0" aria-hidden="true">📄</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {p.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.status === 'published' && p.published_at
                        ? `Published ${new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : `Updated ${new Date(p.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      }
                    </p>
                  </div>
                  {isStaff && embedBadge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${embedBadge.className}`}>
                      {embedBadge.label}
                    </span>
                  )}
                  {isStaff && (
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 capitalize ${style}`}>
                      {p.status}
                    </span>
                  )}
                  <span className="text-muted-foreground text-sm shrink-0 group-hover:text-primary transition-colors">→</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
