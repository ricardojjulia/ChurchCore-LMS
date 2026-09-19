'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

const SAVE_ERROR = 'Unable to save group changes. Please try again.'

async function requireActor(staffOnly = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' } as const
  const { data: profile, error } = await supabase.from('profiles')
    .select('role, org_id').eq('auth_id', user.id).single()
  if (error || !profile?.org_id) return { error: 'Profile not found' } as const
  if (staffOnly && !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return { error: 'Insufficient privileges' } as const
  }
  return { supabase, user, orgId: profile.org_id } as const
}

export async function createGroup(sectionId: string, formData: FormData): Promise<{ error?: string }> {
  const actor = await requireActor(true)
  if ('error' in actor) return { error: actor.error }
  const name = String(formData.get('group_name') ?? '').trim()
  const purpose = String(formData.get('purpose') ?? 'general') || 'general'
  const capacity = String(formData.get('max_members') ?? '').trim()
  const maxMembers = capacity ? Number(capacity) : null
  if (!name) return { error: 'Group name is required' }
  if (!['collaboration', 'grading', 'project', 'discussion', 'lab', 'general'].includes(purpose)) {
    return { error: 'Choose a valid group purpose' }
  }
  if (maxMembers !== null && (!Number.isSafeInteger(maxMembers) || maxMembers <= 0)) {
    return { error: 'Maximum members must be a positive whole number' }
  }
  const { data: section, error: sectionError } = await actor.supabase.from('course_sections')
    .select('id').eq('id', sectionId).eq('org_id', actor.orgId).maybeSingle()
  if (sectionError) return { error: SAVE_ERROR }
  if (!section) return { error: 'Section not found' }
  const { error } = await actor.supabase.from('section_groups').insert({
    section_id: sectionId, org_id: actor.orgId, group_name: name,
    group_code: String(formData.get('group_code') ?? '').trim() || null,
    purpose, max_members: maxMembers, created_by: actor.user.id,
  })
  if (error) return { error: error.code === '23505' ? 'A group with that name already exists in this section' : SAVE_ERROR }
  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function deleteGroup(sectionId: string, groupId: string): Promise<{ error?: string }> {
  const actor = await requireActor(true)
  if ('error' in actor) return { error: actor.error }
  const { error } = await actor.supabase.from('section_groups').delete()
    .eq('id', groupId).eq('section_id', sectionId).eq('org_id', actor.orgId)
  if (error) return { error: SAVE_ERROR }
  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function addGroupMember(sectionId: string, groupId: string, userId: string,
  role: 'member' | 'leader' = 'member'): Promise<{ error?: string }> {
  const actor = await requireActor(true)
  if ('error' in actor) return { error: actor.error }
  if (!['member', 'leader'].includes(role)) return { error: 'Choose a valid member role' }
  const [{ data: group, error: groupError }, { data: member, error: memberError }] = await Promise.all([
    actor.supabase.from('section_groups').select('id').eq('id', groupId)
      .eq('section_id', sectionId).eq('org_id', actor.orgId).maybeSingle(),
    actor.supabase.from('profiles').select('auth_id').eq('auth_id', userId)
      .eq('org_id', actor.orgId).maybeSingle(),
  ])
  if (groupError || memberError) return { error: SAVE_ERROR }
  if (!group || !member) return { error: 'Group or member not found' }
  const { error } = await actor.supabase.from('section_group_members').insert({
    group_id: groupId, user_id: member.auth_id, org_id: actor.orgId, role,
  })
  if (error?.code === 'PCC01') return { error: 'This group has reached its maximum number of members.' }
  if (error) return { error: error.code === '23505' ? 'User is already in this group' : SAVE_ERROR }
  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function removeGroupMember(sectionId: string, groupId: string, userId: string): Promise<{ error?: string }> {
  const actor = await requireActor(true)
  if ('error' in actor) return { error: actor.error }
  const { data: group, error: groupError } = await actor.supabase.from('section_groups')
    .select('id').eq('id', groupId).eq('section_id', sectionId).eq('org_id', actor.orgId).maybeSingle()
  if (groupError) return { error: SAVE_ERROR }
  if (!group) return { error: 'Group not found' }
  const { error } = await actor.supabase.from('section_group_members').delete()
    .eq('group_id', groupId).eq('user_id', userId).eq('org_id', actor.orgId)
  if (error) return { error: SAVE_ERROR }
  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function createThread(groupId: string, title: string): Promise<{ threadId?: string; error?: string }> {
  const actor = await requireActor()
  if ('error' in actor) return { error: actor.error }
  if (!title.trim()) return { error: 'Thread title is required' }
  const { data: group, error: groupError } = await actor.supabase.from('section_groups')
    .select('id').eq('id', groupId).eq('org_id', actor.orgId).maybeSingle()
  if (groupError) return { error: SAVE_ERROR }
  if (!group) return { error: 'Group not found' }
  const { data, error } = await actor.supabase.from('group_threads').insert({
    group_id: groupId, org_id: actor.orgId, title: title.trim(), created_by: actor.user.id,
  }).select('id').single()
  if (error || !data) return { error: SAVE_ERROR }
  revalidatePath(`/my-groups/${groupId}`)
  return { threadId: data.id }
}

export async function postToThread(groupId: string, threadId: string, body: string): Promise<{ error?: string }> {
  const actor = await requireActor()
  if ('error' in actor) return { error: actor.error }
  if (!body.trim()) return { error: 'Reply is required' }
  const { data: thread, error: threadError } = await actor.supabase.from('group_threads')
    .select('id, is_locked').eq('id', threadId).eq('group_id', groupId).eq('org_id', actor.orgId).maybeSingle()
  if (threadError) return { error: SAVE_ERROR }
  if (!thread) return { error: 'Thread not found' }
  if (thread.is_locked) return { error: 'This thread is locked' }
  const { error } = await actor.supabase.from('group_posts').insert({
    thread_id: threadId, group_id: groupId, org_id: actor.orgId,
    author_id: actor.user.id, body: body.trim(),
  })
  if (error) return { error: SAVE_ERROR }
  revalidatePath(`/my-groups/${groupId}`)
  return {}
}

export async function softDeletePost(groupId: string, postId: string): Promise<{ error?: string }> {
  const actor = await requireActor()
  if ('error' in actor) return { error: actor.error }
  const { error } = await actor.supabase.from('group_posts').update({ is_deleted: true })
    .eq('id', postId).eq('author_id', actor.user.id).eq('group_id', groupId).eq('org_id', actor.orgId)
  if (error) return { error: SAVE_ERROR }
  revalidatePath(`/my-groups/${groupId}`)
  return {}
}
