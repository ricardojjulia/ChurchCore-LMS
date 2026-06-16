import { createClient } from '@/utils/supabase/server'
import MobileAdminDrawer from './MobileAdminDrawer'

export default async function MobileAdminDrawerServer() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return null

  const isAdmin = profile.role === 'admin'

  return <MobileAdminDrawer isAdmin={isAdmin} />
}
