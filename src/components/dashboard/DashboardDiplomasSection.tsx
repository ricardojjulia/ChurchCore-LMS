import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

interface DiplomaRow {
  id:         string
  diploma_no: string
  awarded_at: string
  // Supabase returns a single object for a foreign-key join when using .select('col(field)')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  program_tracks: any
}

export default async function DashboardDiplomasSection({ uid }: { uid: string }) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('program_diplomas')
    .select('id, diploma_no, awarded_at, program_tracks(name)')
    .eq('user_id', uid)
    .order('awarded_at', { ascending: false })

  if (error || !data || data.length === 0) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diplomas = data as unknown as DiplomaRow[]

  return (
    <section className="mb-8" aria-label="Diplomas Earned">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground">Diplomas Earned</h2>
        <Link
          href="/certificates"
          className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          View all →
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {diplomas.map((diploma) => {
          const awardedDate = new Date(diploma.awarded_at).toLocaleDateString(undefined, {
            year: 'numeric', month: 'long', day: 'numeric',
          })
          // program_tracks may arrive as an object or single-element array depending on Supabase client version
          const trackData = Array.isArray(diploma.program_tracks)
            ? diploma.program_tracks[0]
            : diploma.program_tracks
          const trackName = (trackData as { name?: string } | null)?.name ?? 'Program Track'

          return (
            <div
              key={diploma.id}
              className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 px-5 py-4 flex items-center gap-3">
                <span className="text-2xl leading-none" role="img" aria-label="graduation cap">🎓</span>
                <div className="min-w-0">
                  <p className="text-amber-100 text-[10px] font-bold uppercase tracking-widest">
                    Diploma Earned
                  </p>
                  <p className="text-white font-bold text-sm mt-0.5 line-clamp-2">{trackName}</p>
                </div>
              </div>

              {/* Card body */}
              <div className="px-5 py-4">
                <p className="text-xs text-muted-foreground mb-2">{awardedDate}</p>
                <p className="font-mono text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 inline-block">
                  {diploma.diploma_no}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
