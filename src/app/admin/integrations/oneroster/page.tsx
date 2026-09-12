import { redirect } from 'next/navigation'
import { OneRosterImportClient } from './OneRosterImportClient'
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
    <main className="mx-auto w-full max-w-5xl px-4 py-8 md:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Integrations</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">OneRoster</h1>
      </div>

      <OneRosterImportClient />
    </main>
  )
}
