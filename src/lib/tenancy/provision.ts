import type { SupabaseClient } from '@supabase/supabase-js'

// Tenant provisioning shared by the platform console (createTenant) and
// public self-serve signup (COUNCIL-2026-034, Amendment 1): one code path,
// one set of tests. Service-role client only.

export const TRIAL_DAYS = 14

export interface ProvisionInput {
  name: string
  slug: string
  plan?: string
  trialDays?: number
  source: 'admin' | 'self_serve'
  features?: Record<string, boolean>
  timezone?: string
  locale?: 'en' | 'es'
}

export interface ProvisionedOrg {
  id: string
  name: string
  slug: string
  plan: string
  status: string
  trial_ends_at: string | null
}

const DEFAULT_FEATURES = {
  ai_tutor: false,
  guardian_portal: true,
  leaderboard: true,
  hq: false,
  reporting: true,
}

export async function provisionTenant(
  service: SupabaseClient,
  input: ProvisionInput,
): Promise<{ org?: ProvisionedOrg; error?: 'slug_taken' | 'failed' }> {
  const plan = input.plan ?? 'free'
  const trialDays = input.trialDays ?? TRIAL_DAYS
  const trial = plan === 'free'

  const { data: org, error } = await service
    .from('organizations')
    .insert({
      name: input.name,
      slug: input.slug,
      plan,
      status: trial ? 'trial' : 'active',
      trial_ends_at: trial ? new Date(Date.now() + trialDays * 86_400_000).toISOString() : null,
      signup_source: input.source,
      settings: {
        branding: {},
        features: { ...DEFAULT_FEATURES, ...(input.features ?? {}) },
        locale: input.locale ?? 'en',
        timezone: input.timezone ?? 'America/New_York',
        onboarding: {
          logo_uploaded: false,
          first_teacher_invited: false,
          first_course_created: false,
          first_announcement_published: false,
        },
      },
    })
    .select('id, name, slug, plan, status, trial_ends_at')
    .single()

  if (error?.code === '23505') return { error: 'slug_taken' }
  if (error || !org) return { error: 'failed' }
  return { org: org as ProvisionedOrg }
}
