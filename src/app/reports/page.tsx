import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'

export default async function ReportsPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  switch (profile?.role) {
    case 'student':  redirect('/student/reports')
    case 'teacher':  redirect('/instructor/reports')
    case 'manager':  redirect('/instructor/reports')
    case 'admin':    redirect('/admin/reports')
    default:
      return (
        <main className="mx-auto max-w-xl px-6 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-950">Reports not available</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account role does not have a reports view assigned. Contact your administrator.
          </p>
        </main>
      )
  }
}
