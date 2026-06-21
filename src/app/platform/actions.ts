'use server'

import { revalidatePath }        from 'next/cache'
import { redirect }              from 'next/navigation'
import { createServerClient }    from '@/lib/supabase/server'
import { createServiceClient }   from '@/utils/supabase/service'

async function assertPlatformAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) throw new Error('Forbidden')
  return user
}

async function logAction(
  actorId: string,
  action: string,
  targetOrg: string | null,
  payload?: Record<string, unknown>,
) {
  const service = createServiceClient()
  await service.from('platform_audit_log').insert({
    actor_id: actorId,
    action,
    target_org: targetOrg,
    payload: payload ?? null,
  })
}

// ─── Create Tenant ────────────────────────────────────────────────────────────
export async function createTenant(formData: FormData) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  const name       = formData.get('name') as string
  const slug       = formData.get('slug') as string
  const plan       = (formData.get('plan') as string) || 'free'
  const trialDays  = Number(formData.get('trial_days') ?? 14)
  const adminEmail = (formData.get('admin_email') as string | null)?.trim() || null

  const features = {
    ai_tutor:        formData.get('feat_ai_tutor') === 'on',
    guardian_portal: formData.get('feat_guardian') === 'on',
    leaderboard:     formData.get('feat_leaderboard') === 'on',
    hq:              formData.get('feat_hq') === 'on',
    reporting:       formData.get('feat_reporting') === 'on',
  }

  const { data: org, error: orgErr } = await service
    .from('organizations')
    .insert({
      name,
      slug,
      plan,
      status: plan === 'free' ? 'trial' : 'active',
      trial_ends_at: plan === 'free'
        ? new Date(Date.now() + trialDays * 86_400_000).toISOString()
        : null,
      settings: {
        branding: {},
        features,
        onboarding: {
          logo_uploaded:                false,
          first_teacher_invited:        false,
          first_course_created:         false,
          first_announcement_published: false,
        },
      },
    })
    .select()
    .single()

  if (orgErr) throw new Error(orgErr.message)

  if (adminEmail) {
    const { error: inviteErr } = await service.auth.admin.inviteUserByEmail(adminEmail, {
      data: { org_id: org.id, role: 'admin' },
    })
    if (inviteErr) console.warn('Invite failed:', inviteErr.message)
  }

  await logAction(actor.id, 'create_tenant', org.id, {
    name: org.name,
    plan: org.plan,
    admin_email: adminEmail,
  })

  redirect(`/platform/tenants/${org.id}`)
}

// ─── Suspend Tenant ───────────────────────────────────────────────────────────
export async function suspendTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations').update({ status: 'suspended' }).eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'suspend_tenant', orgId)

  revalidatePath('/platform')
}

// ─── Restore Tenant ───────────────────────────────────────────────────────────
export async function restoreTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations').update({ status: 'active' }).eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'restore_tenant', orgId)

  revalidatePath('/platform')
}

// ─── Soft Delete Tenant ───────────────────────────────────────────────────────
export async function softDeleteTenant(orgId: string) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  await service.from('organizations')
    .update({ status: 'deleted', deleted_at: new Date().toISOString() })
    .eq('id', orgId)
  await service.rpc('sync_org_status_to_profiles', { p_org_id: orgId })
  await logAction(actor.id, 'soft_delete_tenant', orgId)

  revalidatePath('/platform')
  redirect('/platform')
}

// ─── Update Tenant Settings ───────────────────────────────────────────────────
export async function updateTenant(orgId: string, formData: FormData) {
  const actor = await assertPlatformAdmin()
  const service = createServiceClient()

  const { data: existing } = await service
    .from('organizations').select('settings').eq('id', orgId).single()

  const updatedSettings = {
    ...(existing?.settings ?? {}),
    branding: {
      ...(existing?.settings?.branding ?? {}),
      logo_url:       (formData.get('logo_url') as string) || undefined,
      primary_color:  (formData.get('primary_color') as string) || undefined,
      email_from_name:(formData.get('email_from_name') as string) || undefined,
    },
    features: {
      ai_tutor:        formData.get('feat_ai_tutor') === 'on',
      guardian_portal: formData.get('feat_guardian') === 'on',
      leaderboard:     formData.get('feat_leaderboard') === 'on',
      hq:              formData.get('feat_hq') === 'on',
      reporting:       formData.get('feat_reporting') === 'on',
    },
  }

  await service.from('organizations').update({
    name:     formData.get('name') as string,
    plan:     formData.get('plan') as string,
    settings: updatedSettings,
  }).eq('id', orgId)

  await logAction(actor.id, 'update_tenant', orgId, { name: formData.get('name') })

  revalidatePath(`/platform/tenants/${orgId}`)
  redirect(`/platform/tenants/${orgId}`)
}
