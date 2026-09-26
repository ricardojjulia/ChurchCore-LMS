import { resolveUserDashboardContext } from '@/lib/dashboard/context'
import { createClient }                from '@/utils/supabase/server'
import { redirect }                    from 'next/navigation'
import { getHealthChecks }             from '@/lib/queries/getHealthChecks'
import StudentDashboard    from '@/components/dashboard/StudentDashboard'
import InstructorDashboard from '@/components/dashboard/InstructorDashboard'
import AdminDashboard      from '@/components/dashboard/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Role resolved server-side from DB — no client role claims trusted
  // A suspended organization (e.g. an expired trial) has no data access, so
  // this runs before anything that reads through RLS (which would otherwise
  // bounce between /dashboard and /login). COUNCIL-2026-034 Amendment 8.
  const tenantCheck = await (await createClient()).rpc('current_user_tenant_active')
  if (tenantCheck.data === false) redirect('/billing/renew')

  const ctx = await resolveUserDashboardContext()

  if (ctx.role === 'admin') {
    const supabase = await createClient()
    const [healthChecks, profileOrg] = await Promise.all([
      getHealthChecks(supabase),
      supabase
        .from('profiles')
        .select('org_id')
        .eq('auth_id', ctx.authId)
        .single(),
    ])
    let onboarding = null
    let trialEndsAt: string | null = null
    if (profileOrg.data?.org_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('settings, status, trial_ends_at')
        .eq('id', profileOrg.data.org_id)
        .single()
      onboarding = org?.settings?.onboarding ?? null
      if (org?.status === 'trial' && org.trial_ends_at) trialEndsAt = org.trial_ends_at
    }
    return <AdminDashboard ctx={ctx} healthChecks={healthChecks} onboarding={onboarding} trialEndsAt={trialEndsAt} />
  }

  if (ctx.role === 'teacher' || ctx.role === 'manager') return <InstructorDashboard ctx={ctx} />
  return <StudentDashboard ctx={ctx} />
}
