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

// ── Allowed roles for bulk invite (matches user_role enum + guardian) ──────────
const BULK_INVITE_VALID_ROLES = [
  'admin',
  'manager',
  'teacher',
  'student',
  'guardian',
] as const
type BulkInviteRole = (typeof BULK_INVITE_VALID_ROLES)[number]

export interface BulkInviteRow {
  email: string
  display_name: string
  role: string
}

export interface BulkInviteResult {
  email: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
}

export async function bulkInviteUsers(
  rows: BulkInviteRow[],
): Promise<BulkInviteResult[]> {
  // Auth check — caller must be an org admin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (callerProfile?.role !== 'admin') throw new Error('Unauthorized')
  // org_id must always come from the server session, never from the client request
  const orgId: string = callerProfile.org_id

  if (rows.length > 50) throw new Error('Too many rows. Maximum is 50.')

  const service = createServiceClient()
  const results: BulkInviteResult[] = []

  for (const row of rows) {
    // Server-side role allow-list check
    if (!BULK_INVITE_VALID_ROLES.includes(row.role as BulkInviteRole)) {
      results.push({ email: row.email, status: 'failed', reason: 'Invalid role' })
      continue
    }

    // Duplicate check — same org (skip, not a hard error)
    const { data: sameOrgMatch } = await service
      .from('profiles')
      .select('uid')
      .ilike('email', row.email)
      .eq('org_id', orgId)
      .maybeSingle()

    if (sameOrgMatch) {
      results.push({ email: row.email, status: 'skipped', reason: 'Already a member' })
      continue
    }

    // Duplicate check — different org (hard error, do NOT reveal which org)
    const { data: otherOrgMatch } = await service
      .from('profiles')
      .select('uid')
      .ilike('email', row.email)
      .neq('org_id', orgId)
      .maybeSingle()

    if (otherOrgMatch) {
      results.push({
        email: row.email,
        status: 'failed',
        reason: 'Email registered to another organization',
      })
      continue
    }

    // Send the invite — org_id and role come from server, never from client input
    const { error: inviteError } = await service.auth.admin.inviteUserByEmail(
      row.email,
      {
        data: {
          org_id: orgId,
          role: row.role,
          display_name: row.display_name,
        },
      },
    )

    if (inviteError) {
      // Do NOT expose the raw Supabase error to the client
      results.push({
        email: row.email,
        status: 'failed',
        reason: 'Invite failed. Please try again.',
      })
    } else {
      results.push({ email: row.email, status: 'sent' })
    }
  }

  // Audit log — counts only, no email addresses
  const countSent    = results.filter((r) => r.status === 'sent').length
  const countSkipped = results.filter((r) => r.status === 'skipped').length
  const countFailed  = results.filter((r) => r.status === 'failed').length

  await service.from('admin_audit_log').insert({
    actor_id:    user.id,
    action:      'bulk_invite',
    target_type: 'users',
    target_id:   null,
    org_id:      orgId,
    metadata: {
      count_attempted: rows.length,
      count_sent:      countSent,
      count_skipped:   countSkipped,
      count_failed:    countFailed,
    },
  })

  revalidatePath('/admin/users')
  return results
}
