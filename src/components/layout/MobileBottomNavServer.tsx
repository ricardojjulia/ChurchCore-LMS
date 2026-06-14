import { createClient } from '@/utils/supabase/server'
import MobileBottomNav from './MobileBottomNav'

export default async function MobileBottomNavServer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return null

  const { data: msgCount } = await supabase.rpc('count_unread_message_threads')
  const isStaff = ['admin', 'manager', 'teacher'].includes(profile.role)
  const isAdmin = profile.role === 'admin'

  return (
    <MobileBottomNav
      messageCount={typeof msgCount === 'number' ? msgCount : 0}
      isStaff={isStaff}
      isAdmin={isAdmin}
    />
  )
}
