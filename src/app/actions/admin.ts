'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

type UserRole   = 'admin' | 'manager' | 'teacher' | 'student'
type UserStatus = 'active' | 'suspended' | 'pending' | 'archived'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin') throw new Error('Forbidden')
  return { supabase, actorId: user.id }
}

export async function updateUserRole(uid: string, role: UserRole) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('uid', uid)

  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return { success: true }
}

export async function updateUserStatus(uid: string, status: UserStatus) {
  const { supabase } = await requireAdmin()

  const { error } = await supabase
    .from('profiles')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('uid', uid)

  if (error) return { error: error.message }
  revalidatePath('/admin/users')
  return { success: true }
}

export async function inviteUser(email: string, role: UserRole) {
  await requireAdmin()
  if (!email?.trim()) return { error: 'Email is required.' }

  const service = createServiceClient()

  // Invite sends a magic-link email. The handle_new_user trigger creates the
  // profile on first sign-in; we patch the role immediately after via admin API.
  const { data, error } = await service.auth.admin.inviteUserByEmail(email.trim(), {
    data: { role },   // stored in raw_user_meta_data; trigger can read it
  })

  if (error) return { error: error.message }

  // If a profile was already created by the trigger synchronously, set role now.
  // This is a best-effort patch — the trigger may also read raw_user_meta_data.
  await service
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('auth_id', data.user.id)

  revalidatePath('/admin/users')
  return { success: true, userId: data.user.id }
}

export async function deleteUser(uid: string) {
  await requireAdmin()

  // Look up auth_id from profiles so we can delete the auth user
  const service = createServiceClient()
  const { data: profile, error: lookupErr } = await service
    .from('profiles')
    .select('auth_id')
    .eq('uid', uid)
    .single()

  if (lookupErr || !profile) return { error: 'User not found.' }

  // Deleting the auth user cascades to profiles (ON DELETE CASCADE)
  const { error } = await service.auth.admin.deleteUser(profile.auth_id)
  if (error) return { error: error.message }

  revalidatePath('/admin/users')
  return { success: true }
}
