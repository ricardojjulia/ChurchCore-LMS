import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

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

const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  enrolled:    { label: 'Enrolled',    className: 'text-sky-700 bg-sky-50 border-sky-200' },
  in_progress: { label: 'In Progress', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  completed:   { label: 'Completed',   className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  dropped:     { label: 'Dropped',     className: 'text-rose-700 bg-rose-50 border-rose-200' },
}

function gradeColor(pct: number | null): string {
  if (pct === null) return 'text-slate-600'
  if (pct >= 90) return 'text-emerald-700'
  if (pct >= 70) return 'text-amber-700'
  return 'text-rose-700'
}

export default async function GuardianStudentPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'guardian' && !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: raw, error } = await supabase.rpc('get_guardian_student_overview', {
    p_student_uid: studentId,
  })

  if (error || !raw) notFound()

  const overview = raw as Overview
  const student  = overview.profile

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6" aria-label="Breadcrumb">
          <Link href="/guardian" className="hover:text-primary transition-colors font-medium">
            Guardian Portal
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground font-semibold">{student.display_name ?? 'Student'}</span>
        </nav>

        {/* Student profile header */}
        <div className="bg-white border border-border rounded-2xl p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
            <span className="text-2xl font-extrabold text-indigo-700">
              {(student.display_name ?? '?')[0]?.toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-foreground">{student.display_name ?? 'Student'}</h1>
            {student.student_id && (
              <p className="text-sm text-muted-foreground">{student.student_id}</p>
            )}
          </div>
          <div className="flex gap-6 text-center shrink-0">
            <div>
              <p className="text-2xl font-extrabold text-indigo-600">{student.current_level}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Level</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{student.xp.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">XP</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Enrollments */}
          <section>
            <h2 className="text-base font-bold text-foreground mb-3">
              Courses ({overview.enrollments.length})
            </h2>
            {overview.enrollments.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-6 text-center text-sm text-muted-foreground italic">
                Not enrolled in any courses yet.
              </div>
            ) : (
              <div className="space-y-3">
                {overview.enrollments.map((e) => {
                  const st = STATUS_STYLE[e.status] ?? STATUS_STYLE.enrolled
                  return (
                    <div key={e.course_id} className="bg-white border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">{e.course_title}</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${st.className}`}>
                          {st.label}
                        </span>
                      </div>
                      <div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Progress</span>
                          <span>{e.progress_percent}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${e.progress_percent}%` }}
                          />
                        </div>
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
              <h2 className="text-base font-bold text-foreground mb-3">Recent Grades</h2>
              {overview.recent_grades.length === 0 ? (
                <div className="bg-white border border-border rounded-xl p-6 text-center text-sm text-muted-foreground italic">
                  No graded work yet.
                </div>
              ) : (
                <div className="bg-white border border-border rounded-xl overflow-hidden">
                  <ul className="divide-y divide-border">
                    {overview.recent_grades.map((g, i) => (
                      <li key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{g.block_title}</p>
                          <p className="text-xs text-muted-foreground truncate">{g.course_title}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold ${gradeColor(g.grade_pct)}`}>
                            {g.score ?? '?'} / {g.max_score ?? '?'}
                          </p>
                          {g.grade_pct !== null && (
                            <p className="text-xs text-muted-foreground">{g.grade_pct}%</p>
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
                <h2 className="text-base font-bold text-foreground mb-3">
                  Certificates ({overview.certificates.length})
                </h2>
                <div className="space-y-2">
                  {overview.certificates.map((c) => (
                    <div
                      key={c.certificate_number}
                      className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3"
                    >
                      <span className="text-xl shrink-0" aria-hidden="true">🏆</span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-amber-900 truncate">{c.course_title}</p>
                        <p className="text-xs text-amber-700">
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
