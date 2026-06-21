import { createClient } from '@/utils/supabase/server'
import SidebarClient from './SidebarClient'
import SidebarPlaceholder from './SidebarPlaceholder'

export default async function Sidebar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return <SidebarPlaceholder />

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, role, org_id')
    .eq('auth_id', user.id)
    .single()

  const isStaff    = ['teacher', 'admin', 'manager'].includes(profile?.role ?? '')
  const isAdmin    = ['admin', 'manager'].includes(profile?.role ?? '')
  const isGuardian = profile?.role === 'guardian'
  const uid        = profile?.uid ?? null

  const initial     = profile?.display_name?.[0]?.toUpperCase()
    ?? user.email?.[0]?.toUpperCase()
    ?? '?'
  const displayName = profile?.display_name ?? null

  const [{ data: msgCountRow }, { count: healthErrors }, { data: isAdminData }, orgResult] = await Promise.all([
    uid
      ? supabase.rpc('count_unread_message_threads')
      : Promise.resolve({ data: 0 }),
    isAdmin
      ? supabase
          .from('system_health_checks')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'error')
      : Promise.resolve({ count: 0, data: null }),
    supabase.rpc('is_platform_admin'),
    profile?.org_id
      ? supabase.from('organizations').select('settings').eq('id', profile.org_id).single()
      : Promise.resolve({ data: null }),
  ])

  const features: Record<string, boolean> = orgResult.data?.settings?.features ?? {}

  return (
    <SidebarClient
      isStaff={isStaff}
      isAdmin={isAdmin}
      isGuardian={isGuardian}
      isPlatformAdmin={!!isAdminData}
      uid={uid}
      initial={initial}
      displayName={displayName}
      messageCount={typeof msgCountRow === 'number' ? msgCountRow : 0}
      healthErrorCount={healthErrors ?? 0}
      features={features}
    />
  )
}
