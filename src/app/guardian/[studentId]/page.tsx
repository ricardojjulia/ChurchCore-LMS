import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getTranslations } from 'next-intl/server'
import ContactTeacherModal from '@/components/guardian/ContactTeacherModal'
import MessageAboutStudent from '@/components/messages/MessageAboutStudent'

export const dynamic = 'force-dynamic'

interface Enrollment {
  course_id:        string
  course_title:     string
  status:           string
  progress_percent: number
  enrolled_at:      string
}

interface Grade {
  block_title:  string
  course_title: string
  score:        number | null
  max_score:    number | null
  grade_pct:    number | null
  graded_at:    string | null
}

interface Certificate {
  course_title:       string
  certificate_number: string
  issued_at:          string
  grade_pct:          number | null
}

interface Overview {
  profile: {
    uid:           string
    display_name:  string | null
    student_id:    string | null
    current_level: number
    xp:            number
  }
  enrollments:   Enrollment[]
  recent_grades: Grade[]
  certificates:  Certificate[]
}

const STATUS_STYLE: Record<string, { className: string }> = {
  enrolled:    { className: 'text-sky-300 bg-sky-950/60 border-sky-800/60' },
  in_progress: { className: 'text-amber-300 bg-amber-950/60 border-amber-800/60' },
  completed:   { className: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/60' },
  dropped:     { className: 'text-rose-300 bg-rose-950/60 border-rose-800/60' },
}

function gradeColor(pct: number | null): string {
  if (pct === null) return 'text-slate-400'
  if (pct >= 90) return 'text-emerald-400'
  if (pct >= 70) return 'text-amber-400'
  return 'text-rose-400'
}

export default async function GuardianStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
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
  // Guardian-only: get_guardian_student_overview authorizes the linked guardian
  // and nobody else, so staff used to land on a 404 here. Staff see students
  // through their own admin and gradebook views.
  if (profile.role !== 'guardian') {
    redirect(['admin', 'manager', 'teacher'].includes(profile.role) ? '/guardian' : '/dashboard')
  }

  const { data: raw, error } = await supabase.rpc('get_guardian_student_overview', {
    p_student_uid: studentId,
  })

  if (error || !raw) notFound()

  const overview = raw as Overview
  const student  = overview.profile

  // Each course's teacher, for "Message teacher" (COUNCIL-2026-035). Guardians
  // can't read staff profiles under RLS; the course ids come from the
  // guardian-authorized overview RPC above, so only those courses' teacher
  // names are looked up server-side. Sending is still checked by the database.
  const courseIds = overview.enrollments.map((e) => e.course_id)
  const { data: courseTeachers } = courseIds.length
    ? await createServiceClient().from('courses').select('id, owner_id, profiles!courses_owner_id_fkey(display_name)').in('id', courseIds)
    : { data: [] }
  const teacherByCourse = new Map(
    ((courseTeachers ?? []) as unknown as Array<{ id: string; owner_id: string | null; profiles: { display_name: string | null } | null }>)
      .filter((c) => c.owner_id)
      .map((c) => [c.id, { uid: c.owner_id as string, name: c.profiles?.display_name ?? '' }]),
  )

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link href="/guardian" className="hover:text-amber-300 transition-colors font-medium">
            {t('guardian.list.heading')}
          </Link>
          <span aria-hidden="true" className="text-slate-600">/</span>
          <span className="text-white font-semibold">{student.display_name ?? t('common.studentFallback')}</span>
        </nav>

        {/* Student profile header */}
        <div className="card-crisp p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-indigo-900/60 border border-indigo-700/60 flex items-center justify-center shrink-0">
            <span className="text-2xl font-extrabold text-indigo-300">
              {(student.display_name ?? '?')[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-display font-extrabold text-white tracking-tight">{student.display_name ?? t('common.studentFallback')}</h1>
            {student.student_id && (
              <p className="text-sm text-slate-400 font-mono">{student.student_id}</p>
            )}
          </div>
          <div className="flex gap-6 text-center shrink-0">
            <div>
              <p className="text-2xl font-extrabold text-indigo-400">{student.current_level}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">{t('common.levelLabel')}</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-amber-300">{student.xp.toLocaleString()}</p>
              <p className="text-xs text-slate-400 uppercase tracking-wider">{t('guardian.detail.xpStatLabel')}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Enrollments */}
          <section>
            <h2 className="text-base font-display font-bold text-white mb-3">
              {t('guardian.detail.coursesSectionHeadingTemplate', { n: overview.enrollments.length })}
            </h2>
            {overview.enrollments.length === 0 ? (
              <div className="card-crisp p-6 text-center text-sm text-slate-400 italic">
                {t('guardian.detail.emptyEnrollments')}
              </div>
            ) : (
              <div className="space-y-3">
                {overview.enrollments.map((e) => {
                  const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.enrolled
                  const statusLabel = e.status === 'completed' ? t('status.completed')
                    : e.status === 'in_progress' ? t('status.inProgress')
                    : e.status === 'dropped' ? t('status.dropped')
                    : t('status.enrolled')
                  return (
                    <div key={e.course_id} className="card-crisp p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-semibold text-white leading-snug">{e.course_title}</p>
                          {e.status !== 'dropped' && teacherByCourse.get(e.course_id) && (
                            <MessageAboutStudent
                              studentUid={student.uid}
                              recipientUid={teacherByCourse.get(e.course_id)!.uid}
                              recipientName={teacherByCourse.get(e.course_id)!.name}
                              label={t('messages.aboutStudent.messageTeacher', { name: teacherByCourse.get(e.course_id)!.name })}
                            />
                          )}
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.className}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="mb-3">
                        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                          <span>{t('guardian.detail.progressBarLabel')}</span>
                          <span className="font-semibold text-slate-200">{e.progress_percent}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full"
                            style={{ width: `${e.progress_percent}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end pt-1 border-t border-slate-800">
                        <ContactTeacherModal
                          studentUid={student.uid}
                          studentName={student.display_name ?? 'Student'}
                          courseId={e.course_id}
                          courseTitle={e.course_title}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <div className="space-y-6">
            {/* Recent grades */}
            <section>
              <h2 className="text-base font-display font-bold text-white mb-3">{t('guardian.detail.recentGradesHeading')}</h2>
              {overview.recent_grades.length === 0 ? (
                <div className="card-crisp p-6 text-center text-sm text-slate-400 italic">
                  {t('guardian.detail.emptyGrades')}
                </div>
              ) : (
                <div className="card-crisp overflow-hidden">
                  <ul className="divide-y divide-slate-800">
                    {overview.recent_grades.map((g, i) => (
                      <li key={i} className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-800/40 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{g.block_title}</p>
                          <p className="text-xs text-slate-400 truncate">{g.course_title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${gradeColor(g.grade_pct)}`}>
                            {g.score ?? '?'} / {g.max_score ?? '?'}
                          </p>
                          {g.grade_pct !== null && (
                            <p className="text-xs text-slate-400">{g.grade_pct}%</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* Certificates */}
            {overview.certificates.length > 0 && (
              <section>
                <h2 className="text-base font-display font-bold text-white mb-3">
                  {t('guardian.detail.certificatesSectionHeadingTemplate', { n: overview.certificates.length })}
                </h2>
                <div className="space-y-2">
                  {overview.certificates.map((c) => (
                    <div
                      key={c.certificate_number}
                      className="bg-amber-950/40 border border-amber-800/60 rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <span className="text-xl shrink-0" aria-hidden="true">🏆</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-amber-200 truncate">{c.course_title}</p>
                        <p className="text-xs text-amber-400/80">
                          {c.certificate_number} ·{' '}
                          {new Date(c.issued_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                          {c.grade_pct !== null ? ` · ${c.grade_pct}%` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
