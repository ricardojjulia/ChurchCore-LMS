import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

interface StudentCard {
  student_uid:      string
  display_name:     string | null
  student_id:       string | null
  current_level:    number
  xp:               number
  enrollment_count: number
  completed_count:  number
  linked_at:        string
}

export default async function GuardianPage() {
  const t = await getTranslations()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, display_name')
    .eq('auth_id', user.id)
    .single()

  if (!profile) redirect('/login')
  if (profile.role !== 'guardian' && !['admin', 'manager', 'teacher'].includes(profile.role)) {
    redirect('/dashboard')
  }

  const { data: students, error } = await supabase.rpc('get_guardian_students')
  const studentList = (students as StudentCard[] | null) ?? []

  return (
    <main className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-white tracking-tight font-display">{t('guardian.list.heading')}</h1>
          <p className="text-sm text-slate-400 mt-1">
            {t('guardian.list.subtitle')}
          </p>
        </div>

        {error && (
          <div className="card-crisp border-rose-800/70 bg-rose-950/40 px-4 py-3 mb-4 text-sm text-rose-300">
            {t('guardian.list.loadError')}
          </div>
        )}

        {studentList.length === 0 ? (
          <div className="card-crisp p-12 text-center">
            <p className="text-4xl mb-3">👨‍👧</p>
            <h2 className="text-base font-bold text-white mb-1">{t('guardian.list.emptyHeading')}</h2>
            <p className="text-sm text-slate-400">
              {t('guardian.list.emptyDescription')}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {studentList.map((s) => (
              <Link
                key={s.student_uid}
                href={`/guardian/${s.student_uid}`}
                className="card-crisp p-5 hover:border-indigo-500/50 hover:shadow-lg transition-all group"
              >
                {/* Avatar + name */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-950/80 border border-indigo-800 flex items-center justify-center shrink-0">
                    <span className="text-lg font-bold text-amber-300">
                      {(s.display_name ?? '?')[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate group-hover:text-amber-300 transition-colors">
                      {s.display_name ?? t('common.studentFallback')}
                    </p>
                    {s.student_id && (
                      <p className="text-xs text-slate-400">{s.student_id}</p>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-800/60 rounded-xl py-2">
                    <p className="text-lg font-extrabold text-amber-300">{s.current_level}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{t('common.levelLabel')}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl py-2">
                    <p className="text-lg font-extrabold text-white">{s.enrollment_count}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{t('guardian.list.coursesStat')}</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-xl py-2">
                    <p className="text-lg font-extrabold text-emerald-400">{s.completed_count}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest">{t('guardian.list.doneStat')}</p>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-3 flex items-center justify-between">
                  <span>{t('guardian.list.viewProgressLink')}</span>
                  <span className="text-amber-300">→</span>
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
