import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminProgramTracksPage() {
  const t = await getTranslations('adminProgramTracks')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

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
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-white">{t('heading')}</h1>
            <p className="text-sm text-slate-400 mt-1">
              {t('subtitle')}
            </p>
          </div>
          <Link
            href="/admin/program-tracks/new"
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            {t('newTrack')}
          </Link>
        </div>

        {(!tracks || tracks.length === 0) ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">{t('emptyState')}</p>
            <Link
              href="/admin/program-tracks/new"
              className="mt-3 inline-block text-sm text-indigo-400 hover:underline"
            >
              {t('createFirst')}
            </Link>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/80 border-b border-slate-800">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-slate-300">{t('tableTrack')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-300">{t('tableStatus')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-300">{t('tableCreated')}</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tracks.map((track) => (
                  <tr key={track.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-6 py-4">
                      <p className="font-semibold text-white">{track.name}</p>
                      <p className="text-xs text-slate-400 font-mono">{track.code}</p>
                      {track.description && (
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xl">
                          {track.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        track.is_active
                          ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {track.is_active ? t('statusActive') : t('statusInactive')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-slate-400 text-xs">
                      {new Date(track.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/admin/program-tracks/${track.id}`}
                        className="text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        {t('edit')}
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
