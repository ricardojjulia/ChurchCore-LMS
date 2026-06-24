import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface Certificate {
  id:              string
  course_id:       string
  issued_at:       string
  final_grade:     number | null
  letter_grade:    string
  total_xp_earned: number
  certificate_no:  string
  courses:         { title: string }[] | null
}

interface Diploma {
  id:             string
  diploma_no:     string
  awarded_at:     string
  // Supabase join returns object or array depending on relation cardinality
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program_tracks: any
}

export default async function CertificatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/auth/login')

  const [certsResult, diplomasResult] = await Promise.all([
    supabase
      .from('course_certificates')
      .select('id, course_id, issued_at, final_grade, letter_grade, total_xp_earned, certificate_no, courses(title)')
      .eq('user_id', profile.uid)
      .order('issued_at', { ascending: false }),
    supabase
      .from('program_diplomas')
      .select('id, diploma_no, awarded_at, program_tracks(name)')
      .eq('user_id', profile.uid)
      .order('awarded_at', { ascending: false }),
  ])

  const rows     = (certsResult.data ?? []) as Certificate[]
  const diplomas = (diplomasResult.data ?? []) as unknown as Diploma[]

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">My Certificates</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {rows.length} certificate{rows.length !== 1 ? 's' : ''} earned
              {diplomas.length > 0 && (
                <span> · {diplomas.length} diploma{diplomas.length !== 1 ? 's' : ''} earned</span>
              )}
            </p>
          </div>
          <Link href="/performance" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Academic performance →
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-4xl mb-3">🎓</p>
            <p className="text-muted-foreground italic mb-4">No certificates yet.</p>
            <Link
              href="/courses"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors"
            >
              Browse courses →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((cert) => {
              const courseTitle = cert.courses?.[0]?.title ?? 'Unknown Course'
              const issuedDate  = new Date(cert.issued_at).toLocaleDateString(undefined, {
                year: 'numeric', month: 'long', day: 'numeric',
              })

              return (
                <div
                  key={cert.id}
                  className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Card header */}
                  <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-4">
                    <p className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest">Certificate</p>
                    <p className="text-white font-bold text-sm mt-0.5 line-clamp-2">{courseTitle}</p>
                  </div>

                  {/* Card body */}
                  <div className="px-6 py-4">
                    <p className="text-xs text-muted-foreground mb-3">{issuedDate}</p>

                    <div className="flex items-center gap-4">
                      {cert.final_grade !== null && (
                        <div>
                          <p className="text-2xl font-extrabold text-foreground">{cert.letter_grade}</p>
                          <p className="text-xs text-muted-foreground">{cert.final_grade}% avg</p>
                        </div>
                      )}
                      {cert.total_xp_earned > 0 && (
                        <div>
                          <p className="text-2xl font-extrabold text-indigo-600">{cert.total_xp_earned}</p>
                          <p className="text-xs text-muted-foreground">XP earned</p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                      <p className="text-[10px] font-mono text-muted-foreground/60">{cert.certificate_no}</p>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/courses/${cert.course_id}/complete`}
                          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                        >
                          View →
                        </Link>
                        <a
                          href={`/api/certificates/${cert.id}/pdf`}
                          download
                          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-500 transition-colors"
                        >
                          Download PDF
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Program Diplomas */}
        {diplomas.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-extrabold text-foreground mb-4">Program Diplomas</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {diplomas.map((diploma) => {
                // program_tracks may arrive as object or single-element array
                const trackData = Array.isArray(diploma.program_tracks)
                  ? diploma.program_tracks[0]
                  : diploma.program_tracks
                const trackName  = (trackData as { name?: string } | null)?.name ?? 'Program Track'
                const awardedDate = new Date(diploma.awarded_at).toLocaleDateString(undefined, {
                  year: 'numeric', month: 'long', day: 'numeric',
                })

                return (
                  <div
                    key={diploma.id}
                    className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                  >
                    {/* Card header */}
                    <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-4 flex items-center gap-3">
                      <span className="text-2xl leading-none" role="img" aria-label="graduation cap">🎓</span>
                      <div className="min-w-0">
                        <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest">
                          Program Diploma
                        </p>
                        <p className="text-white font-bold text-sm mt-0.5 line-clamp-2">{trackName}</p>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="px-6 py-4">
                      <p className="text-xs text-muted-foreground mb-3">{awardedDate}</p>
                      <p className="font-mono text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 inline-block">
                        {diploma.diploma_no}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
