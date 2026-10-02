import { redirect } from 'next/navigation'
import { OneRosterWorkspace } from './OneRosterWorkspace'
import { createClient } from '@/utils/supabase/server'

export default async function OneRosterIntegrationPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Integrations</p>
          <h1 className="mt-1 text-3xl font-extrabold text-white tracking-tight">OneRoster</h1>
        </div>

        <OneRosterWorkspace />
      </div>
    </main>
  )
}
