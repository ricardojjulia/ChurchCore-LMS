'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

async function assertOrgAdmin(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || profile.org_id !== orgId || !['admin', 'manager'].includes(profile.role ?? '')) {
    throw new Error('Forbidden')
  }
}

export async function updateOrgBranding(orgId: string, formData: FormData) {
  await assertOrgAdmin(orgId)
  const service = createServiceClient()

  const { data: existing } = await service
    .from('organizations')
    .select('settings')
    .eq('id', orgId)
    .single()

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    branding: {
      ...(existing?.settings?.branding ?? {}),
      logo_url:        (formData.get('logo_url') as string) || undefined,
      primary_color:   (formData.get('primary_color') as string) || undefined,
      email_from_name: (formData.get('email_from_name') as string) || undefined,
    },
  }

  await service
    .from('organizations')
    .update({ settings: updatedSettings })
    .eq('id', orgId)

  revalidatePath('/admin/settings')
  revalidatePath('/', 'layout')
}
