import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import BadgesAdminClient from './BadgesAdminClient'

export const dynamic = 'force-dynamic'

interface Badge {
  id:                string
  title:             string
  description:       string
  is_auto_awarded:   boolean
  trigger_condition: Record<string, unknown> | null
}

export default async function BadgesAdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager'].includes(pr.role)) redirect('/dashboard')

  const { data: badges } = await supabase
    .from('badges')
    .select('id, title, description, is_auto_awarded, trigger_condition')
    .eq('org_id', pr.org_id)
    .order('title', { ascending: true })

  return (
    <main id="main-content" className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">Badges</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Create badges and configure automatic award triggers.
          </p>
        </div>
        <BadgesAdminClient initialBadges={(badges ?? []) as Badge[]} />
      </div>
    </main>
  )
}
