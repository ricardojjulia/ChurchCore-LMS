import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ProgramTrackForm from './ProgramTrackForm'

export default async function NewProgramTrackPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-slate-950 py-10 px-4 sm:px-6 lg:px-8 text-slate-100">
      <div className="max-w-xl mx-auto">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/program-tracks" className="hover:text-white font-medium transition-colors">Program Tracks</Link>
          <span className="text-slate-600">/</span>
          <span className="text-white font-semibold">New</span>
        </nav>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-sm">
          <h1 className="text-xl font-extrabold text-white mb-6">New Program Track</h1>
          <ProgramTrackForm mode="create" />
        </div>
      </div>
    </main>
  )
}
