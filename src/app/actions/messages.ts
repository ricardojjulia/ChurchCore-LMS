'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, display_name, role')
    .eq('auth_id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  return { supabase, profile }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim()
}

async function checkRateLimit(supabase: ReturnType<typeof createClient>, uid: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', uid)
    .gte('created_at', since)

  return (count ?? 0) < 20
}

// ── Get existing direct thread between two users ─────────────────────
async function findDirectThread(supabase: ReturnType<typeof createClient>, myUid: string, otherUid: string) {
  // Threads where both users are participants and type=direct
  const { data } = await supabase.rpc('find_direct_thread', {
    uid_a: myUid,
    uid_b: otherUid,
  })
  return data as string | null
}

// ── Search users (for composing new messages) ─────────────────────────
export async function searchUsers(q: string) {
  const { supabase, profile } = await requireAuth()
  if (!q?.trim() || q.trim().length < 2) return []

  const { data } = await supabase
    .from('profiles')
    .select('uid, display_name, email, role')
    .neq('uid', profile.uid)
    .or(`display_name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%`)
    .limit(10)

  return data ?? []
}

// ── Create or return existing direct thread ───────────────────────────
export async function getOrCreateDirectThread(
  recipientUid: string,
  firstMessage: string
): Promise<{ threadId?: string; error?: string }> {
  const { supabase, profile } = await requireAuth()

  if (!recipientUid?.trim()) return { error: 'Recipient is required.' }
  if (recipientUid === profile.uid) return { error: 'Cannot message yourself.' }

  const body = stripHtml(firstMessage ?? '').slice(0, 10000)
  if (!body) return { error: 'Message cannot be empty.' }

  // Check recipient exists
  const { data: recipient } = await supabase
    .from('profiles')
    .select('uid, display_name')
    .eq('uid', recipientUid)
    .single()
  if (!recipient) return { error: 'User not found.' }

  // Check rate limit
  const ok = await checkRateLimit(supabase, profile.uid)
  if (!ok) return { error: 'You are sending messages too quickly. Please wait a moment.' }

  // Use service client to create thread + participants atomically
  // (bypasses RLS for controlled multi-table insert)
  const service = createServiceClient()

  // Check for existing direct thread
  const { data: existingRows } = await service
    .from('message_thread_participants')
    .select('thread_id')
    .eq('user_id', profile.uid)
    .is('left_at', null)

  const myThreadIds = (existingRows ?? []).map((r) => r.thread_id)

  let existingThreadId: string | null = null
  if (myThreadIds.length > 0) {
    const { data: sharedRows } = await service
      .from('message_thread_participants')
      .select('thread_id, message_threads!inner(thread_type)')
      .eq('user_id', recipientUid)
      .is('left_at', null)
      .in('thread_id', myThreadIds)

    const direct = (sharedRows ?? []).find(
      (r) => (r.message_threads as any)?.thread_type === 'direct'
    )
    if (direct) existingThreadId = direct.thread_id
  }

  if (existingThreadId) {
    // Just send to the existing thread
    const { error } = await service.from('messages').insert({
      thread_id: existingThreadId,
      sender_id: profile.uid,
      body,
    })
    if (error) return { error: error.message }
    revalidatePath('/messages')
    return { threadId: existingThreadId }
  }

  // Create new thread
  const { data: thread, error: threadErr } = await service
    .from('message_threads')
    .insert({ thread_type: 'direct', created_by: profile.uid })
    .select('id')
    .single()
  if (threadErr || !thread) return { error: threadErr?.message ?? 'Failed to create thread.' }

  // Add both participants
  const { error: partErr } = await service.from('message_thread_participants').insert([
    { thread_id: thread.id, user_id: profile.uid,    role: 'owner',  can_reply: true },
    { thread_id: thread.id, user_id: recipientUid,   role: 'member', can_reply: true },
  ])
  if (partErr) return { error: partErr.message }

  // Send first message
  const { error: msgErr } = await service.from('messages').insert({
    thread_id: thread.id,
    sender_id: profile.uid,
    body,
  })
  if (msgErr) return { error: msgErr.message }

  // Create notification for recipient
  await service.from('notifications').insert({
    user_id:        recipientUid,
    type:           'message_received',
    title:          `New message from ${profile.display_name}`,
    body:           body.slice(0, 80),
    link:           `/messages/${thread.id}`,
    reference_type: 'message_thread',
    reference_id:   thread.id,
  })

  revalidatePath('/messages')
  return { threadId: thread.id }
}

// ── Send message to existing thread ──────────────────────────────────
export async function sendMessage(
  threadId: string,
  body: string
): Promise<{ error?: string }> {
  const { supabase, profile } = await requireAuth()

  const clean = stripHtml(body ?? '').slice(0, 10000)
  if (!clean) return { error: 'Message cannot be empty.' }

  // Validate participation (RLS enforced at DB, but explicit check gives better error)
  const { data: participant } = await supabase
    .from('message_thread_participants')
    .select('can_reply, left_at')
    .eq('thread_id', threadId)
    .eq('user_id', profile.uid)
    .single()

  if (!participant || participant.left_at) return { error: 'You are not in this conversation.' }
  if (!participant.can_reply) return { error: 'You cannot reply in this thread.' }

  // Rate limit
  const ok = await checkRateLimit(supabase, profile.uid)
  if (!ok) return { error: 'Too many messages. Please wait a moment.' }

  const { error } = await supabase
    .from('messages')
    .insert({ thread_id: threadId, sender_id: profile.uid, body: clean })

  if (error) return { error: error.message }

  // Notify other participants
  const service = createServiceClient()
  const { data: others } = await service
    .from('message_thread_participants')
    .select('user_id')
    .eq('thread_id', threadId)
    .neq('user_id', profile.uid)
    .is('left_at', null)
    .eq('is_muted', false)

  if (others && others.length > 0) {
    await service.from('notifications').insert(
      others.map((p) => ({
        user_id:        p.user_id,
        type:           'message_received',
        title:          `New message from ${profile.display_name}`,
        body:           clean.slice(0, 80),
        link:           `/messages/${threadId}`,
        reference_type: 'message_thread',
        reference_id:   threadId,
      }))
    )
  }

  revalidatePath(`/messages/${threadId}`)
  return {}
}

// ── Mark thread as read ───────────────────────────────────────────────
export async function markThreadRead(threadId: string): Promise<void> {
  const { supabase, profile } = await requireAuth()

  await supabase
    .from('message_thread_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .eq('user_id', profile.uid)

  revalidatePath('/messages')
  revalidatePath(`/messages/${threadId}`)
}

// ── Soft-delete own message ───────────────────────────────────────────
export async function deleteMessage(messageId: string): Promise<{ error?: string }> {
  const { supabase, profile } = await requireAuth()

  const { error } = await supabase
    .from('messages')
    .update({ is_deleted: true, deleted_at: new Date().toISOString(), deleted_by: profile.uid })
    .eq('id', messageId)
    .eq('sender_id', profile.uid)

  if (error) return { error: error.message }
  return {}
}
