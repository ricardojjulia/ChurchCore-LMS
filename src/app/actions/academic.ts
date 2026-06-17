'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: p } = await supabase
    .from('profiles').select('role').eq('auth_id', user.id).single()
  if (!p || !['admin', 'manager'].includes(p.role)) throw new Error('Insufficient privileges')
  return { supabase, userId: user.id }
}

// ── Program Tracks ──────────────────────────────────────────────────────────

export async function createProgramTrack(formData: FormData): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const name        = (formData.get('name')        as string)?.trim()
  const code        = (formData.get('code')        as string)?.trim().toUpperCase()
  const description = (formData.get('description') as string)?.trim() || null

  if (!name || !code) return { error: 'Name and code are required' }

  const { error } = await ctx.supabase.from('program_tracks').insert({
    name,
    code,
    description,
    created_by: ctx.userId,
  })

  if (error) {
    if (error.code === '23505') return { error: 'A program track with that name or code already exists' }
    return { error: error.message }
  }

  revalidatePath('/admin/program-tracks')
  redirect('/admin/program-tracks')
}

export async function updateProgramTrack(
  trackId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const name        = (formData.get('name')        as string)?.trim()
  const description = (formData.get('description') as string)?.trim() || null
  const isActive    = formData.get('is_active') === 'true'

  if (!name) return { error: 'Name is required' }

  const { error } = await ctx.supabase
    .from('program_tracks')
    .update({ name, description, is_active: isActive })
    .eq('id', trackId)

  if (error) return { error: error.message }

  revalidatePath('/admin/program-tracks')
  revalidatePath(`/admin/program-tracks/${trackId}`)
  return {}
}

// ── Terms ──────────────────────────────────────────────────────────────────

export async function createTerm(formData: FormData): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const name         = (formData.get('term_name')      as string)?.trim()
  const code         = (formData.get('term_code')      as string)?.trim().toUpperCase()
  const type         = (formData.get('type')           as string)
  const startDate    = (formData.get('start_date')     as string)
  const endDate      = (formData.get('end_date')       as string)
  const parentTermId = (formData.get('parent_term_id') as string) || null
  const configRaw    = (formData.get('config')         as string)?.trim() || '{}'

  if (!name || !code || !type || !startDate || !endDate)
    return { error: 'Name, code, type, start and end dates are required' }
  if (new Date(endDate) <= new Date(startDate))
    return { error: 'End date must be after start date' }

  let config: object
  try { config = JSON.parse(configRaw) }
  catch { return { error: 'Config must be valid JSON' } }

  const { error } = await ctx.supabase.from('academic_terms').insert({
    term_name:      name,
    term_code:      code,
    type,
    start_date:     startDate,
    end_date:       endDate,
    parent_term_id: parentTermId,
    config,
    created_by:     ctx.userId,
  })

  if (error) {
    if (error.code === '23505') return { error: 'A term with that code already exists' }
    return { error: error.message }
  }

  revalidatePath('/admin/terms')
  redirect('/admin/terms')
}

export async function updateTerm(
  termId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const name      = (formData.get('term_name')  as string)?.trim()
  const startDate = (formData.get('start_date') as string)
  const endDate   = (formData.get('end_date')   as string)
  const isActive  = formData.get('is_active') !== 'false'
  const configRaw = (formData.get('config')     as string)?.trim() || '{}'

  if (!name || !startDate || !endDate) return { error: 'Name, start and end dates are required' }
  if (new Date(endDate) <= new Date(startDate)) return { error: 'End date must be after start date' }

  let config: object
  try { config = JSON.parse(configRaw) }
  catch { return { error: 'Config must be valid JSON' } }

  const { error } = await ctx.supabase
    .from('academic_terms')
    .update({ term_name: name, start_date: startDate, end_date: endDate, is_active: isActive, config })
    .eq('id', termId)

  if (error) return { error: error.message }

  revalidatePath('/admin/terms')
  revalidatePath(`/admin/terms/${termId}`)
  return {}
}

// ── Blueprints ─────────────────────────────────────────────────────────────

export async function createBlueprint(formData: FormData): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const code        = (formData.get('course_code')      as string)?.trim().toUpperCase()
  const title       = (formData.get('title')            as string)?.trim()
  const description = (formData.get('description')      as string)?.trim() || null
  const credits     = parseFloat(formData.get('credits') as string) || null
  const trackId     = (formData.get('program_track_id') as string) || null

  if (!code || !title) return { error: 'Course code and title are required' }

  const { error } = await ctx.supabase.from('course_blueprints').insert({
    course_code:      code,
    title,
    description,
    credits,
    program_track_id: trackId,
    created_by:       ctx.userId,
  })

  if (error) {
    if (error.code === '23505') return { error: 'A blueprint with that course code already exists' }
    return { error: error.message }
  }

  revalidatePath('/admin/blueprints')
  redirect('/admin/blueprints')
}

export async function updateBlueprint(
  blueprintId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const title       = (formData.get('title')            as string)?.trim()
  const description = (formData.get('description')      as string)?.trim() || null
  const credits     = parseFloat(formData.get('credits') as string) || null
  const trackId     = (formData.get('program_track_id') as string) || null
  const isActive    = formData.get('is_active') !== 'false'

  if (!title) return { error: 'Title is required' }

  const { error } = await ctx.supabase
    .from('course_blueprints')
    .update({ title, description, credits, program_track_id: trackId, is_active: isActive })
    .eq('id', blueprintId)

  if (error) return { error: error.message }

  revalidatePath('/admin/blueprints')
  revalidatePath(`/admin/blueprints/${blueprintId}`)
  return {}
}

// ── Sections ───────────────────────────────────────────────────────────────

export async function createSection(formData: FormData): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const blueprintId    = (formData.get('blueprint_id')           as string)
  const termId         = (formData.get('term_id')                as string)
  const sectionCode    = (formData.get('section_code')           as string)?.trim().toUpperCase()
  const deliveryFormat = (formData.get('delivery_format')        as string)
  const maxEnrollment  = parseInt(formData.get('max_enrollment')  as string) || null
  const enrollOpen     = (formData.get('enrollment_open_date')   as string) || null
  const enrollClose    = (formData.get('enrollment_close_date')  as string) || null
  const windowStart    = (formData.get('window_start')           as string) || null
  const windowEnd      = (formData.get('window_end')             as string) || null
  const graceDays      = parseInt(formData.get('grace_days')      as string) || 0

  if (!blueprintId || !termId || !sectionCode || !deliveryFormat)
    return { error: 'Blueprint, term, section code and delivery format are required' }

  const { data: section, error: secErr } = await ctx.supabase
    .from('course_sections')
    .insert({
      blueprint_id:          blueprintId,
      term_id:               termId,
      section_code:          sectionCode,
      delivery_format:       deliveryFormat,
      max_enrollment:        maxEnrollment,
      enrollment_open_date:  enrollOpen   ? new Date(enrollOpen).toISOString()  : null,
      enrollment_close_date: enrollClose  ? new Date(enrollClose).toISOString() : null,
      created_by:            ctx.userId,
    })
    .select('id')
    .single()

  if (secErr) {
    if (secErr.code === '23505') return { error: 'A section with that code already exists in this term for this blueprint' }
    return { error: secErr.message }
  }

  // Create access window if provided
  if (windowStart && windowEnd && section) {
    const { error: winErr } = await ctx.supabase.from('access_windows').insert({
      section_id: section.id,
      start_date: new Date(windowStart).toISOString(),
      end_date:   new Date(windowEnd).toISOString(),
      grace_days: graceDays,
    })
    if (winErr) return { error: `Section created but access window failed: ${winErr.message}` }
  }

  revalidatePath('/admin/sections')
  redirect(`/admin/sections/${section!.id}`)
}
