import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function CourseCompletePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, xp_points, current_level')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const [{ data: course }, { data: enrollment }, { data: cert }] = await Promise.all([
    supabase.from('courses').select('id, title, description').eq('id', courseId).single(),
    supabase
      .from('enrollments')
      .select('transit_status, progress_percent, completed_at')
      .eq('user_id',   profile.uid)
      .eq('course_id', courseId)
      .single(),
    supabase
      .from('course_certificates')
      .select('certificate_no, issued_at, final_grade, letter_grade, total_xp_earned')
      .eq('user_id',   profile.uid)
      .eq('course_id', courseId)
      .maybeSingle(),
  ])

  if (!course) redirect('/courses')
  if (!enrollment || enrollment.transit_status !== 'completed') {
    redirect(`/courses/${courseId}/learn`)
  }

  const completedDate = cert?.issued_at
    ? new Date(cert.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : enrollment.completed_at
      ? new Date(enrollment.completed_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <main id="main-content" className="min-h-screen bg-gradient-to-b from-indigo-950 to-slate-900 flex flex-col items-center justify-center px-4 py-16">
      {/* Confetti-like top accent */}
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-emerald-400 to-amber-400" />

      <div className="w-full max-w-2xl">

        {/* Celebration header */}
        <div className="text-center mb-10">
          <p className="text-5xl mb-4">🎓</p>
          <h1 className="text-4xl font-extrabold text-white tracking-tight">
            Course Complete!
          </h1>
          <p className="text-indigo-300 text-lg mt-2">
            You finished <span className="font-bold text-white">{course.title}</span>
          </p>
        </div>

        {/* Certificate card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden mb-6">
          {/* Certificate header */}
          <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-8 py-6 text-center">
            <p className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">
              Certificate of Completion
            </p>
            <p className="text-white text-sm">ChurchCore LMS</p>
          </div>

          {/* Certificate body */}
          <div className="px-8 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-1">This certifies that</p>
            <p className="text-2xl font-extrabold text-foreground mb-1">
              {profile.display_name ?? 'Student'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">has successfully completed</p>
            <p className="text-xl font-bold text-indigo-700 mb-6">{course.title}</p>

            {/* Stats row */}
            <div className="flex justify-center gap-8 mb-6">
              {cert?.final_grade !== null && cert?.final_grade !== undefined && (
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-foreground">{cert.letter_grade}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Final Grade</p>
                  <p className="text-xs font-semibold text-muted-foreground">{cert.final_grade}%</p>
                </div>
              )}
              {cert?.total_xp_earned !== undefined && cert.total_xp_earned > 0 && (
                <div className="text-center">
                  <p className="text-3xl font-extrabold text-indigo-600">{cert.total_xp_earned}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">XP Earned</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-3xl font-extrabold text-emerald-600">{enrollment.progress_percent}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">Completion</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mb-2">{completedDate}</p>
            {cert?.certificate_no && (
              <p className="text-[10px] font-mono text-muted-foreground/60">
                {cert.certificate_no}
              </p>
            )}
          </div>

          {/* Level badge */}
          <div className="border-t border-border px-8 py-4 bg-muted/20 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Your current standing</p>
              <p className="text-sm font-bold text-foreground">
                Level {profile.current_level} · {profile.xp_points.toLocaleString()} total XP
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Leaderboard →
            </Link>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/certificates"
            className="inline-flex items-center gap-2 bg-white text-slate-900 font-bold px-5 py-2.5 rounded-xl hover:bg-slate-100 transition-colors text-sm"
          >
            View all certificates
          </Link>
          <Link
            href="/courses"
            className="inline-flex items-center gap-2 bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-indigo-500 transition-colors text-sm"
          >
            Browse more courses →
          </Link>
        </div>

        <p className="text-center text-slate-500 text-xs mt-6">
          <Link href="/performance" className="hover:text-slate-300 transition-colors">
            View full academic performance →
          </Link>
        </p>
      </div>
    </main>
  )
}
