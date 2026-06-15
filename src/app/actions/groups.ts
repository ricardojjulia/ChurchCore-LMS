'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    throw new Error('Insufficient privileges')
  }
  return supabase
}

export async function createGroup(
  sectionId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  let supabase
  try { supabase = await requireStaff() } catch (e: any) { return { error: e.message } }

  const { data: { user } } = await (await createClient()).auth.getUser()

  const name       = (formData.get('group_name') as string)?.trim()
  const code       = (formData.get('group_code') as string)?.trim() || null
  const purpose    = (formData.get('purpose')    as string) || null
  const maxMembers = parseInt(formData.get('max_members') as string) || null

  if (!name) return { error: 'Group name is required' }

  const { error } = await supabase.from('section_groups').insert({
    section_id:  sectionId,
    group_name:  name,
    group_code:  code,
    purpose:     purpose || null,
    max_members: maxMembers,
    created_by:  user!.id,
  })

  if (error) {
    if (error.code === '23505') return { error: 'A group with that name already exists in this section' }
    return { error: error.message }
  }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function deleteGroup(
  sectionId: string,
  groupId: string,
): Promise<{ error?: string }> {
  let supabase
  try { supabase = await requireStaff() } catch (e: any) { return { error: e.message } }

  const { error } = await supabase.from('section_groups').delete().eq('id', groupId)
  if (error) return { error: error.message }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function addGroupMember(
  sectionId: string,
  groupId: string,
  userId: string,
  role: 'member' | 'leader' = 'member',
): Promise<{ error?: string }> {
  let supabase
  try { supabase = await requireStaff() } catch (e: any) { return { error: e.message } }

  const { error } = await supabase
    .from('section_group_members')
    .insert({ group_id: groupId, user_id: userId, role })

  if (error) {
    if (error.code === '23505') return { error: 'User is already in this group' }
    return { error: error.message }
  }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function removeGroupMember(
  sectionId: string,
  groupId: string,
  userId: string,
): Promise<{ error?: string }> {
  let supabase
  try { supabase = await requireStaff() } catch (e: any) { return { error: e.message } }

  const { error } = await supabase
    .from('section_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)

  if (error) return { error: error.message }

  revalidatePath(`/admin/sections/${sectionId}`)
  return {}
}

export async function createThread(
  groupId: string,
  title: string,
): Promise<{ threadId?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data, error } = await supabase
    .from('group_threads')
    .insert({ group_id: groupId, title: title.trim(), created_by: user.id })
    .select('id')
    .single()

  if (error) return { error: error.message }

  revalidatePath(`/my-groups/${groupId}`)
  return { threadId: data.id }
}

export async function postToThread(
  groupId: string,
  threadId: string,
  body: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const { error } = await supabase.from('group_posts').insert({
    thread_id: threadId,
    group_id:  groupId,
    author_id: profile.uid,
    body:      body.trim(),
  })

  if (error) return { error: error.message }

  revalidatePath(`/my-groups/${groupId}`)
  return {}
}

export async function softDeletePost(
  groupId: string,
  postId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid')
    .eq('auth_id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const { error } = await supabase
    .from('group_posts')
    .update({ is_deleted: true })
    .eq('id', postId)
    .eq('author_id', profile.uid)

  if (error) return { error: error.message }

  revalidatePath(`/my-groups/${groupId}`)
  return {}
}
