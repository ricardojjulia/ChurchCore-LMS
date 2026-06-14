'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

type Priority = 'low' | 'normal' | 'high' | 'urgent'
type Scope    = 'global' | 'course' | 'role'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'teacher', 'manager'].includes(profile.role)) {
    throw new Error('Forbidden')
  }
  return { supabase, profile }
}

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  return { supabase, profile }
}

export async function createAnnouncement(data: {
  title:      string
  body:       string
  scope:      Scope
  priority:   Priority
  courseId?:  string
  targetRole?: string
  publishAt?: string
  expiresAt?: string
  publish:    boolean
}): Promise<{ id?: string; error?: string }> {
  const { supabase, profile } = await requireStaff()

  if (!data.title?.trim()) return { error: 'Title is required.' }
  if (!data.body?.trim())  return { error: 'Body is required.' }

  // Instructors can only post course-scoped announcements
  if (profile.role !== 'admin' && data.scope !== 'course') {
    return { error: 'Only admins can post global or role-scoped announcements.' }
  }
  if (data.scope === 'course' && !data.courseId) {
    return { error: 'Course is required for course-scoped announcements.' }
  }

  const { data: row, error } = await supabase
    .from('announcements')
    .insert({
      created_by:  profile.uid,
      title:       data.title.trim(),
      body:        data.body.trim(),
      scope:       data.scope,
      priority:    data.priority,
      course_id:   data.courseId ?? null,
      target_role: data.targetRole ?? null,
      publish_at:  data.publishAt ?? new Date().toISOString(),
      expires_at:  data.expiresAt ?? null,
      is_published: data.publish,
      published_at: data.publish ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return { id: row.id }
}

export async function publishAnnouncement(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireStaff()

  const { error } = await supabase
    .from('announcements')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/announcements')
  revalidatePath('/dashboard')
  return {}
}

export async function markAnnouncementRead(id: string): Promise<void> {
  const { supabase, profile } = await requireAuth()

  await supabase
    .from('announcement_reads')
    .upsert({ announcement_id: id, user_id: profile.uid }, { onConflict: 'announcement_id,user_id' })

  revalidatePath('/announcements')
  revalidatePath('/dashboard')
}

export async function createCalendarEvent(data: {
  title:       string
  eventType:   string
  startsAt:    string
  endsAt?:     string
  isAllDay?:   boolean
  description?: string
  location?:   string
  colorCode?:  string
  scope:       'personal' | 'course' | 'institutional'
  courseId?:   string
}): Promise<{ id?: string; error?: string }> {
  const { supabase, profile } = await requireAuth()

  if (!data.title?.trim()) return { error: 'Title is required.' }
  if (!data.startsAt)       return { error: 'Start date is required.' }

  const { data: row, error } = await supabase
    .from('calendar_events')
    .insert({
      created_by:  profile.uid,
      user_id:     data.scope === 'personal' ? profile.uid : null,
      course_id:   data.courseId ?? null,
      event_type:  data.eventType,
      title:       data.title.trim(),
      description: data.description?.trim() ?? null,
      starts_at:   data.startsAt,
      ends_at:     data.endsAt ?? null,
      is_all_day:  data.isAllDay ?? false,
      location:    data.location?.trim() ?? null,
      color_code:  data.colorCode ?? '#6366F1',
      scope:       data.scope,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/calendar')
  return { id: row.id }
}
