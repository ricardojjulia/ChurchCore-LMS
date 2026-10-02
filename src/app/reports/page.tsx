import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

export default async function ReportsPage() {
  const t = await getTranslations()
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  switch (profile?.role) {
    case 'student':  redirect('/student/reports')
    case 'teacher':  redirect('/instructor/reports')
    case 'manager':  redirect('/instructor/reports')
    case 'admin':    redirect('/admin/reports')
    default:
      return (
        <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6 py-16 text-center">
          <div className="mx-auto max-w-xl">
            <h1 className="text-2xl font-extrabold text-white">{t('reports.fallback.heading')}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {t('reports.fallback.description')}
            </p>
          </div>
        </main>
      )
  }
}
