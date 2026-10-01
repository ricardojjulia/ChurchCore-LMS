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

  const { data: managedLink, error: managedError } = await ctx.supabase
    .from('external_entity_links')
    .select('id')
    .eq('local_table', 'academic_terms')
    .eq('local_id', termId)
    .eq('managed_by_external_system', true)
    .limit(1)
    .maybeSingle()
  if (managedError) return { error: 'Unable to verify term ownership' }

  const changes = managedLink
    ? { config }
    : { term_name: name, start_date: startDate, end_date: endDate, is_active: isActive, config }
  const { error } = await ctx.supabase
    .from('academic_terms')
    .update(changes)
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

  const { data: managedLink, error: managedError } = await ctx.supabase
    .from('external_entity_links')
    .select('id')
    .eq('local_table', 'course_blueprints')
    .eq('local_id', blueprintId)
    .eq('managed_by_external_system', true)
    .limit(1)
    .maybeSingle()
  if (managedError) return { error: 'Unable to verify blueprint ownership' }

  const changes = managedLink
    ? { description, credits, program_track_id: trackId }
    : { title, description, credits, program_track_id: trackId, is_active: isActive }
  const { error } = await ctx.supabase
    .from('course_blueprints')
    .update(changes)
    .eq('id', blueprintId)

  if (error) return { error: error.message }

  revalidatePath('/admin/blueprints')
  revalidatePath(`/admin/blueprints/${blueprintId}`)
  return {}
}

export async function deleteBlueprint(blueprintId: string): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const { data: managedLink, error: linkErr } = await ctx.supabase
    .from('external_entity_links')
    .select('id')
    .eq('local_table', 'course_blueprints')
    .eq('local_id', blueprintId)
    .eq('managed_by_external_system', true)
    .limit(1)
    .maybeSingle()

  if (linkErr) return { error: 'Unable to verify blueprint status' }
  if (managedLink) {
    return { error: 'This blueprint is managed by an external system (OneRoster/SIS) and cannot be deleted.' }
  }

  // Check for attached courses
  const { data: attachedCourses } = await ctx.supabase
    .from('courses')
    .select('id, title')
    .eq('blueprint_id', blueprintId)
    .limit(5)

  // Check for attached sections
  const { data: attachedSections } = await ctx.supabase
    .from('course_sections')
    .select('id, section_code')
    .eq('blueprint_id', blueprintId)
    .limit(5)

  const courseCount = attachedCourses?.length ?? 0
  const sectionCount = attachedSections?.length ?? 0

  if (courseCount > 0 || sectionCount > 0) {
    const reasons: string[] = []
    if (courseCount > 0) reasons.push(`${courseCount} linked course${courseCount > 1 ? 's' : ''}`)
    if (sectionCount > 0) reasons.push(`${sectionCount} linked section${sectionCount > 1 ? 's' : ''}`)
    return {
      error: `Cannot delete blueprint because it has dependencies (${reasons.join(', ')}). You can deactivate (archive) this blueprint by unchecking "Active" instead.`,
    }
  }

  const { error: delErr } = await ctx.supabase
    .from('course_blueprints')
    .delete()
    .eq('id', blueprintId)

  if (delErr) return { error: delErr.message }

  revalidatePath('/admin/blueprints')
  return {}
}

// ── Sections ───────────────────────────────────────────────────────────────

export async function createSection(formData: FormData): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const blueprintId      = (formData.get('blueprint_id')           as string)
  const termId           = (formData.get('term_id')                as string)
  const sectionCode      = (formData.get('section_code')           as string)?.trim().toUpperCase()
  const deliveryFormat   = (formData.get('delivery_format')        as string)
  const maxEnrollment    = parseInt(formData.get('max_enrollment')  as string) || null
  const enrollOpen       = (formData.get('enrollment_open_date')   as string) || null
  const enrollClose      = (formData.get('enrollment_close_date')  as string) || null
  const windowStart      = (formData.get('window_start')           as string) || null
  const windowEnd        = (formData.get('window_end')             as string) || null
  const graceDays        = parseInt(formData.get('grace_days')      as string) || 0
  const rawEnrollType    = (formData.get('enrollment_type')        as string) || 'open'
  const VALID_ENROLL_TYPES = ['open', 'cohort_gated', 'invite_only'] as const
  type EnrollType = typeof VALID_ENROLL_TYPES[number]
  const enrollmentType: EnrollType = (VALID_ENROLL_TYPES as readonly string[]).includes(rawEnrollType)
    ? rawEnrollType as EnrollType
    : 'open'

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
      enrollment_type:       enrollmentType,
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

export async function updateSectionEnrollmentType(
  sectionId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const rawEnrollType    = (formData.get('enrollment_type') as string) || 'open'
  const VALID_ENROLL_TYPES = ['open', 'cohort_gated', 'invite_only'] as const
  type EnrollType = typeof VALID_ENROLL_TYPES[number]
  const enrollmentType: EnrollType = (VALID_ENROLL_TYPES as readonly string[]).includes(rawEnrollType)
    ? rawEnrollType as EnrollType
    : 'open'

  const { error } = await ctx.supabase
    .from('course_sections')
    .update({ enrollment_type: enrollmentType })
    .eq('id', sectionId)

  if (error) return { error: error.message }

  revalidatePath('/admin/sections')
  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

// ── Meeting Schedules (Hybrid / Sync Live Sessions) ──────────────────────────

export async function createMeetingSchedule(
  sectionId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const startTime      = (formData.get('start_time')      as string)?.trim() || null
  const endTime        = (formData.get('end_time')        as string)?.trim() || null
  const timezone       = (formData.get('timezone')        as string)?.trim() || 'UTC'
  const effectiveFrom  = (formData.get('effective_from')  as string)?.trim()
  const effectiveUntil = (formData.get('effective_until') as string)?.trim() || null
  const locationType   = (formData.get('location_type')   as string) || 'virtual'
  const locationDetail = (formData.get('location_detail') as string)?.trim() || null
  const rrule          = (formData.get('rrule')          as string)?.trim() || null

  if (!effectiveFrom) return { error: 'Effective start date is required' }
  if (startTime && endTime && endTime <= startTime) {
    return { error: 'End time must be after start time' }
  }

  const { error } = await ctx.supabase.from('meeting_schedules').insert({
    section_id:      sectionId,
    start_time:      startTime,
    end_time:        endTime,
    timezone,
    effective_from:  effectiveFrom,
    effective_until: effectiveUntil,
    location_type:   locationType,
    location_detail: locationDetail,
    rrule,
  })

  if (error) return { error: error.message }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function deleteMeetingSchedule(
  scheduleId: string,
  sectionId: string,
): Promise<{ error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const { error } = await ctx.supabase
    .from('meeting_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('section_id', sectionId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function generateAttendanceFromSchedule({
  sectionId,
  courseId,
}: {
  sectionId: string
  courseId:  string
}): Promise<{ count?: number; error?: string }> {
  let ctx
  try { ctx = await requireAdmin() } catch (e: any) { return { error: e.message } }

  const [{ data: schedules }, { data: course }] = await Promise.all([
    ctx.supabase
      .from('meeting_schedules')
      .select('*')
      .eq('section_id', sectionId),
    ctx.supabase
      .from('courses')
      .select('id, org_id')
      .eq('id', courseId)
      .single(),
  ])

  if (!schedules || schedules.length === 0) {
    return { error: 'No meeting schedules found for this section.' }
  }
  if (!course) return { error: 'Course not found.' }

  // Check if course has a module header to attach attendance blocks to
  const { data: modules } = await ctx.supabase
    .from('course_blocks')
    .select('id, sort_order')
    .eq('course_id', courseId)
    .eq('block_type_id', 'module_header')
    .order('sort_order', { ascending: true })

  let targetModuleId = modules?.[0]?.id

  // If no module header exists, create a default "Live Sessions & Attendance" module
  if (!targetModuleId) {
    const newModuleId = crypto.randomUUID()
    const { error: modErr } = await ctx.supabase.from('course_blocks').insert({
      id:            newModuleId,
      course_id:     courseId,
      org_id:        course.org_id,
      block_type_id: 'module_header',
      title:         'Live Sessions & Attendance',
      content:       {},
      sort_order:    1000,
    })
    if (modErr) return { error: `Failed to create module header: ${modErr.message}` }
    targetModuleId = newModuleId
  }

  // Generate attendance sessions for each schedule
  const newBlocks: any[] = []
  let itemSortOrder = 1000

  for (const sched of schedules) {
    const startDate = new Date(sched.effective_from)
    const endDate = sched.effective_until ? new Date(sched.effective_until) : new Date(startDate.getTime() + 60 * 24 * 60 * 60 * 1000)

    // Generate up to 16 weekly meetings
    const curr = new Date(startDate)
    let count = 0
    while (curr <= endDate && count < 16) {
      const dateStr = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      const timeStr = sched.start_time ? ` (${sched.start_time.slice(0, 5)})` : ''
      const title = `Session: ${dateStr}${timeStr}`

      newBlocks.push({
        id:              crypto.randomUUID(),
        course_id:       courseId,
        org_id:          course.org_id,
        parent_block_id: targetModuleId,
        block_type_id:   'attendance',
        title,
        content: {
          session_title:   title,
          tracking_mode:   'both',
          points_possible: 10,
          location_type:   sched.location_type,
          location_detail: sched.location_detail,
          meeting_date:    curr.toISOString().slice(0, 10),
        },
        sort_order: itemSortOrder,
      })

      itemSortOrder += 1000
      count++
      // Advance by 7 days
      curr.setDate(curr.getDate() + 7)
    }
  }

  if (newBlocks.length > 0) {
    const { error: insErr } = await ctx.supabase.from('course_blocks').insert(newBlocks)
    if (insErr) return { error: insErr.message }
  }

  revalidatePath(`/courses/${courseId}`)
  revalidatePath(`/courses/${courseId}/attendance`)
  revalidatePath(`/courses/${courseId}/build`)
  return { count: newBlocks.length }
}

