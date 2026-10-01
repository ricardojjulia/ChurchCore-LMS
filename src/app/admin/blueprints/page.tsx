import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminBlueprintsPage() {
  const t = await getTranslations('adminBlueprints')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: blueprints } = await supabase
    .from('course_blueprints')
    .select('id, course_code, title, description, credits, is_active, program_tracks(name, code)')
    .order('course_code')

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">{t('heading')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
          </div>
          <Link href="/admin/blueprints/new" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-4 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors">
            {t('newBlueprint')}
          </Link>
        </div>

        {(!blueprints || blueprints.length === 0) ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <p className="text-muted-foreground">{t('emptyState')}</p>
            <Link href="/admin/blueprints/new" className="mt-3 inline-block text-sm text-primary hover:underline">{t('createFirst')}</Link>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-muted-foreground">{t('tableBlueprint')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">{t('tableTrack')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('tableCredits')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-muted-foreground">{t('tableStatus')}</th>
                  <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {blueprints.map((b) => {
                  const track = b.program_tracks as unknown as { name: string; code: string } | null
                  return (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-foreground">{b.title}</p>
                        <p className="text-xs text-muted-foreground font-mono">{b.course_code}</p>
                        {b.description && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{b.description}</p>}
                      </td>
                      <td className="px-4 py-4">
                        {track
                           ? <span className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded">{track.code}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground">{b.credits ?? '—'}</td>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${b.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                          {b.is_active ? t('statusActive') : t('statusInactive')}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link href={`/admin/blueprints/${b.id}`} className="text-sm font-semibold text-primary hover:underline">Edit →</Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  )
}
