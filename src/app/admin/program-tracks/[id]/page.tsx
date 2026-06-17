import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import ProgramTrackForm from '../new/ProgramTrackForm'

export const dynamic = 'force-dynamic'

export default async function EditProgramTrackPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: trackId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const { data: track } = await supabase
    .from('program_tracks')
    .select('id, name, code, description, is_active')
    .eq('id', trackId)
    .single()

  if (!track) notFound()

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/program-tracks" className="hover:text-primary font-medium">Program Tracks</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{track.name}</span>
        </nav>

        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-extrabold text-foreground">Edit Program Track</h1>
            <span className="text-xs font-mono text-muted-foreground bg-slate-100 px-2 py-1 rounded">
              {track.code}
            </span>
          </div>
          <ProgramTrackForm
            mode="edit"
            trackId={trackId}
            initial={{
              name: track.name,
              code: track.code,
              description: track.description,
              is_active: track.is_active,
            }}
          />
        </div>
      </div>
    </main>
  )
}
