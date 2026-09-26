import { createClient } from '@/utils/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import type { SurveyContent } from '@/types/blocks'

export const dynamic = 'force-dynamic'

// Survey results for the course's staff (COUNCIL-2026-044). Anonymous surveys
// have no respondent uid stored at all, so names can only appear for named
// surveys.
export default async function SurveyResultsPage({
  params,
}: {
  params: Promise<{ id: string; blockId: string }>
}) {
  const { id: courseId, blockId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('uid, role').eq('auth_id', user.id).single()
  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) redirect('/dashboard')

  const { data: course } = await supabase.from('courses').select('id, title, owner_id').eq('id', courseId).single()
  if (!course) notFound()
  if (course.owner_id !== profile.uid && !['admin', 'manager'].includes(profile.role)) redirect('/dashboard')

  const { data: block } = await supabase
    .from('course_blocks')
    .select('id, title, content')
    .eq('id', blockId)
    .eq('course_id', courseId)
    .eq('block_type_id', 'survey')
    .maybeSingle()
  if (!block) notFound()

  const { questions = [], anonymous = true } = (block.content ?? {}) as Partial<SurveyContent>
  const [{ data: responses }, { count: participants }] = await Promise.all([
    supabase.from('survey_responses').select('answers, respondent_uid, profiles(display_name)').eq('block_id', blockId),
    supabase.from('survey_participation').select('block_id', { count: 'exact', head: true }).eq('block_id', blockId),
  ])
  const rows = (responses ?? []) as unknown as Array<{
    answers: Record<string, string | number>
    respondent_uid: string | null
    profiles: { display_name: string | null } | null
  }>

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-600">
        <Link href={`/courses/${courseId}`} className="hover:underline">{course.title}</Link>
        <span aria-hidden="true"> / </span>
        <span>Survey results</span>
      </nav>
      <h1 className="text-2xl font-bold text-foreground">{block.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {participants ?? 0} response{participants === 1 ? '' : 's'} · {anonymous ? 'Anonymous' : 'Named'}
      </p>

      <div className="mt-6 space-y-6">
        {questions.map((q, i) => {
          const answers = rows.map((r) => ({ value: r.answers?.[q.id], name: r.profiles?.display_name ?? null }))
            .filter((a) => a.value !== undefined && a.value !== '')
          return (
            <section key={q.id} className="rounded-xl border border-border bg-white p-5">
              <h2 className="text-sm font-semibold text-foreground">{i + 1}. {q.text}</h2>
              {answers.length === 0 && <p className="mt-2 text-sm italic text-slate-600">No answers yet.</p>}

              {q.type === 'scale' && answers.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-slate-700">
                    Average: <strong>{(answers.reduce((s, a) => s + Number(a.value), 0) / answers.length).toFixed(1)}</strong> / 5
                  </p>
                  <ul className="mt-2 space-y-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <li key={n} className="flex items-center gap-2 text-xs text-slate-700">
                        <span className="w-3">{n}</span>
                        <span className="h-2 rounded bg-indigo-600" style={{ width: `${(answers.filter((a) => Number(a.value) === n).length / answers.length) * 100}%`, minWidth: 2 }} />
                        <span>{answers.filter((a) => Number(a.value) === n).length}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {q.type === 'choice' && answers.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {(q.options ?? []).map((opt) => (
                    <li key={opt}>{opt}: <strong>{answers.filter((a) => a.value === opt).length}</strong></li>
                  ))}
                </ul>
              )}

              {q.type === 'text' && answers.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {answers.map((a, j) => (
                    <li key={j} className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
                      <p className="whitespace-pre-wrap">{String(a.value)}</p>
                      {!anonymous && a.name && <p className="mt-1 text-xs text-slate-600">{a.name}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
