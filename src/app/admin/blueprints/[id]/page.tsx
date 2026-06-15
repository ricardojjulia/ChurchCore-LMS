import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import BlueprintForm from '../new/BlueprintForm'

export const dynamic = 'force-dynamic'

export default async function EditBlueprintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: blueprintId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: me } = await supabase.from('profiles').select('role').eq('auth_id', user.id).single()
  if (!me || !['admin', 'manager'].includes(me.role)) redirect('/dashboard')

  const [{ data: bp }, { data: tracks }] = await Promise.all([
    supabase.from('course_blueprints')
      .select('id, course_code, title, description, credits, program_track_id, is_active')
      .eq('id', blueprintId).single(),
    supabase.from('program_tracks').select('id, name, code').eq('is_active', true).order('name'),
  ])

  if (!bp) notFound()

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <nav className="flex items-center gap-2 text-sm text-slate-400 mb-6">
          <Link href="/admin/blueprints" className="hover:text-primary font-medium">Blueprints</Link>
          <span>/</span>
          <span className="text-foreground font-semibold">{bp.title}</span>
        </nav>
        <div className="bg-white border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-extrabold text-foreground">Edit Blueprint</h1>
            <span className="text-xs font-mono text-muted-foreground bg-slate-100 px-2 py-1 rounded">{bp.course_code}</span>
          </div>
          <BlueprintForm
            mode="edit"
            blueprintId={blueprintId}
            tracks={tracks ?? []}
            initial={{
              title:            bp.title,
              description:      bp.description,
              credits:          bp.credits,
              program_track_id: bp.program_track_id,
              is_active:        bp.is_active,
            }}
          />
        </div>
      </div>
    </main>
  )
}
