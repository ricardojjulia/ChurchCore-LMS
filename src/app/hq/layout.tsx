import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

// HQ is staff-only (the sidebar already hides it from others), but the page is
// a client component with no server gate, so any signed-in user could open
// /hq directly. Gate it here; hq_* RLS still protects the data itself.
export default async function HqLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) redirect('/dashboard')

  return <>{children}</>
}
