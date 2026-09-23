// COUNCIL-2026-029: Admin — Create new learning path

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import NewPathForm from './NewPathForm'

export const dynamic = 'force-dynamic'

export default async function NewLearningPathPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profile_roles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role ?? '')) {
    redirect('/dashboard')
  }

  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <a href="/admin/paths" className="text-sm text-muted-foreground hover:underline mb-4 inline-block">
        ← Learning Paths
      </a>
      <h1 className="text-2xl font-bold mb-6">New Learning Path</h1>
      <NewPathForm orgId={profile.org_id ?? ''} />
    </main>
  )
}
