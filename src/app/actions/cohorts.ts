'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    throw new Error('Insufficient privileges')
  }
  return supabase
}

export async function createCohort(formData: FormData): Promise<{ error?: string }> {
  const supabase = await requireAdmin().catch((e) => { throw redirect('/dashboard') })

  const name        = (formData.get('cohort_name')      as string)?.trim()
  const code        = (formData.get('cohort_code')      as string)?.trim().toUpperCase()
  const description = (formData.get('description')      as string)?.trim() || null
  const trackId     = (formData.get('program_track_id') as string) || null

  if (!name || !code) return { error: 'Name and code are required' }

  const { data: { user } } = await (await createClient()).auth.getUser()

  const { error } = await supabase
    .from('global_cohorts')
    .insert({ cohort_name: name, cohort_code: code, description, program_track_id: trackId || null, created_by: user!.id })

  if (error) return { error: error.message }

  revalidatePath('/admin/cohorts')
  redirect('/admin/cohorts')
}

export async function updateCohort(
  cohortId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await requireAdmin().catch(() => { throw redirect('/dashboard') })

  const name        = (formData.get('cohort_name')      as string)?.trim()
  const description = (formData.get('description')      as string)?.trim() || null
  const trackId     = (formData.get('program_track_id') as string) || null
  const isActive    = formData.get('is_active') === 'true'

  if (!name) return { error: 'Name is required' }

  const { error } = await supabase
    .from('global_cohorts')
    .update({ cohort_name: name, description, program_track_id: trackId || null, is_active: isActive })
    .eq('id', cohortId)

  if (error) return { error: error.message }

  revalidatePath('/admin/cohorts')
  revalidatePath(`/admin/cohorts/${cohortId}`)
  return {}
}

export async function addCohortMember(
  cohortId: string,
  userId: string,
): Promise<{ error?: string }> {
  const supabase = await requireAdmin().catch(() => ({ error: 'Insufficient privileges' } as never))

  const { error } = await supabase
    .from('cohort_members')
    .insert({ cohort_id: cohortId, user_id: userId })

  if (error) {
    if (error.code === '23505') return { error: 'User is already in this cohort' }
    return { error: error.message }
  }

  revalidatePath(`/admin/cohorts/${cohortId}`)
  return {}
}

export async function removeCohortMember(
  cohortId: string,
  userId: string,
): Promise<{ error?: string }> {
  const supabase = await requireAdmin().catch(() => ({ error: 'Insufficient privileges' } as never))

  const { error } = await supabase
    .from('cohort_members')
    .update({ status: 'withdrawn', exited_at: new Date().toISOString() })
    .eq('cohort_id', cohortId)
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) return { error: error.message }

  revalidatePath(`/admin/cohorts/${cohortId}`)
  return {}
}

export async function startBulkEnrollment(
  cohortId: string,
  sectionId: string,
  dryRun: boolean,
): Promise<{ jobId?: string; error?: string }> {
  let supabase
  try {
    supabase = await requireAdmin()
  } catch {
    return { error: 'Insufficient privileges' }
  }

  const { data: { user } } = await (await createClient()).auth.getUser()

  // Create job record first
  const { data: job, error: jobErr } = await supabase
    .from('enrollment_jobs')
    .insert({
      cohort_id:    cohortId,
      section_id:   sectionId,
      status:       'pending',
      dry_run:      dryRun,
      initiated_by: user!.id,
    })
    .select('id')
    .single()

  if (jobErr || !job) return { error: jobErr?.message ?? 'Failed to create job' }

  // Invoke the DB function
  const { error: fnErr } = await supabase.rpc('bulk_enroll_cohort', {
    p_job_id:     job.id,
    p_cohort_id:  cohortId,
    p_section_id: sectionId,
    p_dry_run:    dryRun,
  })

  if (fnErr) return { jobId: job.id, error: fnErr.message }

  revalidatePath('/admin/cohorts')
  revalidatePath(`/admin/cohorts/${cohortId}`)
  return { jobId: job.id }
}
