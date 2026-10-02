import { redirect }        from 'next/navigation'
import { createClient }    from '@/utils/supabase/server'
import { getHealthChecks } from '@/lib/queries/getHealthChecks'
import SystemHealthPanel   from '@/components/admin/SystemHealthPanel'

export const dynamic = 'force-dynamic'

export default async function AdminHealthPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const initialChecks = await getHealthChecks(supabase)

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-white tracking-tight">System Health</h1>
          <p className="text-sm text-slate-400 mt-1">
            Live infrastructure checks. Results are persisted for trend analysis.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm p-8">
          <SystemHealthPanel initialChecks={initialChecks} />
        </div>
      </div>
    </main>
  )
}
