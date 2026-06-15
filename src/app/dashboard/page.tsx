import { resolveUserDashboardContext } from '@/lib/dashboard/context'
import { createClient }                from '@/utils/supabase/server'
import { getHealthChecks }             from '@/lib/queries/getHealthChecks'
import StudentDashboard    from '@/components/dashboard/StudentDashboard'
import InstructorDashboard from '@/components/dashboard/InstructorDashboard'
import AdminDashboard      from '@/components/dashboard/AdminDashboard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Role resolved server-side from DB — no client role claims trusted
  const ctx = await resolveUserDashboardContext()

  if (ctx.role === 'admin') {
    const supabase    = await createClient()
    const healthChecks = await getHealthChecks(supabase)
    return <AdminDashboard ctx={ctx} healthChecks={healthChecks} />
  }

  if (ctx.role === 'teacher' || ctx.role === 'manager') return <InstructorDashboard ctx={ctx} />
  return <StudentDashboard ctx={ctx} />
}
