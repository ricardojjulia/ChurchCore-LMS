import type { SupabaseClient } from '@supabase/supabase-js'

export type MemberRole = 'admin' | 'manager' | 'teacher' | 'student' | 'guardian'

// Server-only (service-role client). Tenant and role are authorization data:
// they live in app_metadata, which users cannot write, and on the profile row,
// which users cannot update (column-level grant). handle_new_user() reads only
// app_metadata, so flows that create users without it (invites) call this
// right after to place the user in the right org with the right role.
export async function assignMembership(
  service: SupabaseClient,
  authId: string,
  orgId: string,
  role: MemberRole,
): Promise<{ error?: string }> {
  const { error: metaError } = await service.auth.admin.updateUserById(authId, {
    app_metadata: { org_id: orgId, role },
  })
  if (metaError) return { error: 'Could not assign membership.' }

  const { error: profileError } = await service
    .from('profiles')
    .update({ org_id: orgId, role, updated_at: new Date().toISOString() })
    .eq('auth_id', authId)
  if (profileError) return { error: 'Could not assign membership.' }
  return {}
}
