import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export type OneRosterAdminContext =
  | { response: NextResponse }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      orgId: string
      profileUid: string
      authId: string
    }

export async function getOneRosterAdminContext(): Promise<OneRosterAdminContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role) || !profile.org_id) {
    return { response: NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 }) }
  }

  const { data: tenantActive, error: tenantError } = await supabase.rpc('current_user_tenant_active')
  if (tenantError || tenantActive !== true) {
    return { response: NextResponse.json({ error: 'Organization is not active' }, { status: 403 }) }
  }

  return { supabase, orgId: profile.org_id, profileUid: profile.uid, authId: user.id }
}
