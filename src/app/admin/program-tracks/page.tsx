import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminProgramTracksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: tracks } = await supabase
    .from('program_tracks')
    .select('id, name, code, description, is_active, created_at')
    .order('name')

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Program Tracks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pathways used to group course blueprints and cohorts for filtering, reporting, and AI context.
            </p>
          </div>
          <Link
            href="/admin/program-tracks/new"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors"
          >
            + New Track
          </Link>
        </div>

        {(!tracks || tracks.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">No program tracks yet.</p>
            <Link
              href="/admin/program-tracks/new"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Create the first program track →
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Track</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Created</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tracks.map((track) => (
                  <tr key={track.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-foreground">{track.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{track.code}</p>
                      {track.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xl">
                          {track.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        track.is_active
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {track.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground text-xs">
                      {new Date(track.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/program-tracks/${track.id}`}
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
