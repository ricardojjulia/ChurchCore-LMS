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
    .select('uid, display_name, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile) throw new Error('Profile not found')
  return { supabase, profile }
}

// Quote a search term for a PostgREST or() filter: escape LIKE wildcards and
// double quotes, then wrap in quotes so commas and parentheses can't add or
// change filter conditions (COUNCIL-2026-035 Amendment 6).
function likeTerm(q: string): string {
  // Layer 1: LIKE — make %, _ and \ literal. Layer 2: PostgREST's quoted
  // value — escape \ and " so the quotes can't be closed early.
  const like = q.trim().slice(0, 100).replace(/[\\%_]/g, (c) => `\\${c}`)
  const quoted = like.replace(/[\\"]/g, (c) => `\\${c}`)
  return `"%${quoted}%"`
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim()
}

async function checkRateLimit(supabase: Awaited<ReturnType<typeof createClient>>, uid: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString()
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', uid)
    .gte('created_at', since)

  return (count ?? 0) < 20
}

// ── Get existing direct thread between two users ─────────────────────
async function _findDirectThread(supabase: Awaited<ReturnType<typeof createClient>>, myUid: string, otherUid: string) {
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
    .or(`display_name.ilike.${likeTerm(q)},email.ilike.${likeTerm(q)}`)
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
  // (bypasses RLS for controlled multi-table insert). The service role has no
  // session, so org_id must be set explicitly on every row — it was omitted,
  // and every new conversation failed on the NOT NULL org_id constraint.
  const service = createServiceClient()
  const orgId = profile.org_id as string

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase nested join not narrowed by TS
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
      org_id:    orgId,
    })
    if (error) return { error: 'Could not send the message. Please try again.' }
    revalidatePath('/messages')
    return { threadId: existingThreadId }
  }

  // Create new thread
  const { data: thread, error: threadErr } = await service
    .from('message_threads')
    .insert({ thread_type: 'direct', created_by: profile.uid, org_id: orgId })
    .select('id')
    .single()
  if (threadErr || !thread) return { error: 'Could not start the conversation. Please try again.' }

  // Add both participants
  const { error: partErr } = await service.from('message_thread_participants').insert([
    { thread_id: thread.id, user_id: profile.uid,    role: 'owner',  can_reply: true, org_id: orgId },
    { thread_id: thread.id, user_id: recipientUid,   role: 'member', can_reply: true, org_id: orgId },
  ])
  if (partErr) return { error: 'Could not start the conversation. Please try again.' }

  // Send first message
  const { error: msgErr } = await service.from('messages').insert({
    thread_id: thread.id,
    sender_id: profile.uid,
    body,
    org_id:    orgId,
  })
  if (msgErr) return { error: 'Could not send the message. Please try again.' }

  // Create notification for recipient
  await service.from('notifications').insert({
    user_id:        recipientUid,
    type:           'message_received',
    title:          `New message from ${profile.display_name}`,
    body:           body.slice(0, 80),
    link:           `/messages/${thread.id}`,
    reference_type: 'message_thread',
    org_id:         orgId,
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

  // 42501: the database refused — e.g. a guardian thread whose link or
  // enrollment has ended is read-only (COUNCIL-2026-035).
  if (error?.code === '42501') return { error: 'This conversation is closed.' }
  if (error) return { error: 'Could not complete that. Please try again.' }

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
    // org_id must be explicit: the service role has no session, so the
    // column default (the caller's org) is null and the insert used to fail
    // silently — reply notifications were never created.
    await service.from('notifications').insert(
      others.map((p) => ({
        user_id:        p.user_id,
        type:           'message_received',
        title:          `New message from ${profile.display_name}`,
        body:           clean.slice(0, 80),
        link:           `/messages/${threadId}`,
        reference_type: 'message_thread',
        reference_id:   threadId,
        org_id:         profile.org_id,
      }))
    )
    await queueGuardianMessageEmails(service, threadId, others.map((p) => p.user_id))
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

  if (error) return { error: 'Could not complete that. Please try again.' }
  return {}
}

// ── Teacher ↔ guardian threads (COUNCIL-2026-035) ──────────────────────
// Email a guardian recipient (no message body — Amendment 4) when a thread is
// about a student. Non-guardian recipients get only the in-app notification.
async function queueGuardianMessageEmails(
  service: ReturnType<typeof createServiceClient>,
  threadId: string,
  recipientUids: string[],
) {
  const { data: thread } = await service
    .from('message_threads').select('subject_student_uid').eq('id', threadId).maybeSingle()
  if (!thread?.subject_student_uid || recipientUids.length === 0) return
  const { data: guardians } = await service
    .from('profiles').select('uid').in('uid', recipientUids).eq('role', 'guardian')
  if (!guardians?.length) return
  await service.from('guardian_notification_queue').insert(
    guardians.map((g) => ({
      student_uid: thread.subject_student_uid,
      event_type: 'message_received',
      payload: { recipient_guardian_uid: g.uid, thread_id: threadId },
    })),
  )
}

export async function getOrCreateGuardianThread(
  studentUid: string,
  otherUid: string,
  firstMessage: string,
): Promise<{ threadId?: string; error?: string }> {
  const { supabase, profile } = await requireAuth()
  const body = stripHtml(firstMessage ?? '').slice(0, 10000)
  if (!body) return { error: 'Message cannot be empty.' }

  // Pair eligibility is decided by the database (can_message_about), as the
  // caller: same org, a real guardian link, and a teacher who actually
  // teaches the student (or an admin/manager).
  const { data: allowed } = await supabase.rpc('can_message_about', { p_student_uid: studentUid, p_other_uid: otherUid })
  if (allowed !== true) return { error: 'You can’t message this person about this student.' }

  const ok = await checkRateLimit(supabase, profile.uid)
  if (!ok) return { error: 'You are sending messages too quickly. Please wait a moment.' }

  const service = createServiceClient()
  const orgId = profile.org_id as string

  // Reuse the existing thread between these two people about this student.
  const { data: mine } = await service
    .from('message_thread_participants').select('thread_id').eq('user_id', profile.uid).is('left_at', null)
  const myIds = (mine ?? []).map((r) => r.thread_id)
  let threadId: string | null = null
  if (myIds.length) {
    const { data: shared } = await service
      .from('message_thread_participants')
      .select('thread_id, message_threads!inner(subject_student_uid)')
      .eq('user_id', otherUid).is('left_at', null).in('thread_id', myIds)
      .eq('message_threads.subject_student_uid', studentUid)
      .limit(1)
    threadId = shared?.[0]?.thread_id ?? null
  }

  if (!threadId) {
    const { data: student } = await service.from('profiles').select('display_name').eq('uid', studentUid).maybeSingle()
    const { data: thread, error } = await service
      .from('message_threads')
      .insert({
        thread_type: 'direct', created_by: profile.uid, org_id: orgId, subject_student_uid: studentUid,
        subject: `About ${student?.display_name ?? 'a student'}`,
      })
      .select('id').single()
    if (error || !thread) return { error: 'Could not start the conversation. Please try again.' }
    const { error: partErr } = await service.from('message_thread_participants').insert([
      { thread_id: thread.id, user_id: profile.uid, role: 'owner', can_reply: true, org_id: orgId },
      { thread_id: thread.id, user_id: otherUid, role: 'member', can_reply: true, org_id: orgId },
    ])
    if (partErr) return { error: 'Could not start the conversation. Please try again.' }
    threadId = thread.id as string
  }

  // Send as the caller, so the messages policy (including can_post_to_thread) applies.
  const { error: msgErr } = await supabase.from('messages').insert({ thread_id: threadId, sender_id: profile.uid, body, org_id: orgId })
  if (msgErr) return { error: 'Could not send the message. Please try again.' }

  await service.from('notifications').insert({
    user_id: otherUid, type: 'message_received', title: `New message from ${profile.display_name}`,
    body: body.slice(0, 80), link: `/messages/${threadId}`, reference_type: 'message_thread',
    reference_id: threadId, org_id: orgId,
  })
  await queueGuardianMessageEmails(service, threadId, [otherUid])

  revalidatePath('/messages')
  return { threadId }
}
