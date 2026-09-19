// send-guardian-notifications Edge Function
// Processes the guardian_notification_queue: sends emails to guardians when
// their ward completes a course or earns a badge.
//
// Trigger: Supabase CRON (POST) or manual invocation (GET/POST).
// Auth:    No user JWT required — this runs as service role via CRON_SECRET.
//          The CRON scheduler passes Authorization: Bearer <CRON_SECRET>.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@4'

// ─── Environment ─────────────────────────────────────────────────────────────

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY      = Deno.env.get('RESEND_API_KEY')!
const EMAIL_FROM      = Deno.env.get('EMAIL_FROM') ?? 'noreply@churchcore.app'
const CRON_SECRET     = Deno.env.get('CRON_SECRET')!
const JWT_SECRET      = Deno.env.get('SUPABASE_JWT_SECRET')!
const APP_URL         = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueRow {
  id:             string
  student_uid:    string
  event_type:     'course_completed' | 'badge_awarded'
  payload:        Record<string, string>
  debounce_until: string
  created_at:     string
  attempt_count:  number
}

// ADR-2026-010: a row that fails MAX_ATTEMPTS times is dead-lettered
// (failed_at set) instead of retried forever or silently marked sent.
const MAX_ATTEMPTS = 3

interface GuardianLink {
  guardian_uid: string
}

interface ProfileRow {
  uid:          string
  display_name: string
  email:        string
  settings:     { notifications?: { guardian_emails?: boolean } } | null
}

// ─── HMAC-SHA256 JWT for unsubscribe tokens ───────────────────────────────────
// Minimal JWT: base64url(header).base64url(payload).base64url(sig)
// Uses Web Crypto API (available in Deno), no Node.js APIs.

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlString(str: string): string {
  return base64url(new TextEncoder().encode(str).buffer)
}

async function buildUnsubscribeToken(guardianUid: string): Promise<string> {
  const header  = base64urlString(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims  = base64urlString(JSON.stringify({
    sub: 'guardian-unsub',
    guardian_uid: guardianUid,
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  }))
  const signingInput = `${header}.${claims}`

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  )

  return `${signingInput}.${base64url(signature)}`
}

// ─── Email builders ───────────────────────────────────────────────────────────

function buildCourseCompletedEmail(
  studentName: string,
  courseTitle: string,
  portalUrl: string,
  unsubscribeUrl: string,
): { subject: string; html: string } {
  const subject = `${studentName} completed ${courseTitle}`
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:16px">Great news!</h1>
  <p style="font-size:15px;line-height:1.7;margin-bottom:12px">
    ${studentName} has successfully completed <strong>${courseTitle}</strong> — a wonderful achievement worth celebrating.
  </p>
  <p style="font-size:15px;line-height:1.7;margin-bottom:24px">
    You can view their full learning progress, grades, and certificates in the Guardian Portal.
  </p>
  <a href="${portalUrl}"
     style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px">
    View in Guardian Portal
  </a>
  <p style="color:#94a3b8;font-size:12px;margin-top:32px">
    You are receiving this email because you are listed as a guardian in ChurchCore LMS.
    <a href="${unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a>
  </p>
</div>
`
  return { subject, html }
}

function buildBadgeAwardedEmail(
  studentName: string,
  badgeName: string,
  portalUrl: string,
  unsubscribeUrl: string,
): { subject: string; html: string } {
  const subject = `${studentName} earned the ${badgeName} badge`
  const html = `
<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1e293b">
  <h1 style="font-size:22px;font-weight:700;margin-bottom:16px">A new badge was earned!</h1>
  <p style="font-size:15px;line-height:1.7;margin-bottom:12px">
    ${studentName} just earned the <strong>${badgeName}</strong> badge — recognising their dedication and hard work in their studies.
  </p>
  <p style="font-size:15px;line-height:1.7;margin-bottom:24px">
    Visit the Guardian Portal to see all the badges and milestones ${studentName} has achieved.
  </p>
  <a href="${portalUrl}"
     style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px">
    View in Guardian Portal
  </a>
  <p style="color:#94a3b8;font-size:12px;margin-top:32px">
    You are receiving this email because you are listed as a guardian in ChurchCore LMS.
    <a href="${unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a>
  </p>
</div>
`
  return { subject, html }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Allow POST (CRON invocation) and GET (manual invocation / healthcheck).
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Require CRON_SECRET bearer token — no user JWT needed.
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const resend = new Resend(RESEND_KEY)

  // ── Fetch ready rows (debounce window elapsed, not yet sent, not dead-lettered) ──
  const { data: rows, error: fetchErr } = await svc
    .from('guardian_notification_queue')
    .select('id, student_uid, event_type, payload, debounce_until, created_at, attempt_count')
    .lt('debounce_until', new Date().toISOString())
    .is('sent_at', null)
    .is('failed_at', null)
    .limit(50)

  if (fetchErr) {
    console.error('[guardian-notifications] queue fetch error:', fetchErr.code)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch queue' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const queue = (rows ?? []) as QueueRow[]
  let processed = 0
  let sent = 0
  let skipped = 0

  for (const row of queue) {
    processed++

    // ── Get guardian UIDs for this student ─────────────────────────────────
    const { data: links, error: linksErr } = await svc
      .from('guardian_links')
      .select('guardian_uid')
      .eq('student_uid', row.student_uid)

    if (linksErr || !links || links.length === 0) {
      // No guardians linked — mark sent to prevent future retries.
      await svc
        .from('guardian_notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', row.id)
      skipped++
      continue
    }

    // ── Fetch student display name ─────────────────────────────────────────
    const { data: studentRow } = await svc
      .from('profiles')
      .select('display_name')
      .eq('uid', row.student_uid)
      .single()

    const studentName: string = studentRow?.display_name ?? 'Your student'

    // ── Fetch course title for course_completed events ─────────────────────
    let courseTitle = ''
    if (row.event_type === 'course_completed' && row.payload.course_id) {
      const { data: courseRow } = await svc
        .from('courses')
        .select('title')
        .eq('id', row.payload.course_id)
        .single()
      courseTitle = courseRow?.title ?? 'a course'
    }

    const badgeName: string = row.payload.badge_name ?? 'a badge'

    // ── Send to each guardian ──────────────────────────────────────────────
    const portalUrl      = `${APP_URL}/guardian`
    // ADR-2026-010: track whether any guardian's send genuinely failed (as
    // opposed to a legitimate skip — no email, opted out, missing profile).
    // A genuine failure means this row must NOT be marked sent — it retries
    // or dead-letters instead of silently disappearing.
    let rowHadFailure = false
    let lastErrorMessage = ''

    for (const link of links as GuardianLink[]) {
      const guardianUid = link.guardian_uid

      // Fetch guardian profile — need email and notification preferences.
      const { data: guardianProfile, error: profileErr } = await svc
        .from('profiles')
        .select('uid, display_name, email, settings')
        .eq('uid', guardianUid)
        .single()

      if (profileErr || !guardianProfile) {
        // Guardian profile missing — skip silently.
        skipped++
        continue
      }

      const profile = guardianProfile as ProfileRow

      // Respect opt-out: skip if guardian has explicitly disabled guardian emails.
      if (profile.settings?.notifications?.guardian_emails === false) {
        skipped++
        continue
      }

      if (!profile.email) {
        skipped++
        continue
      }

      // Build unsubscribe token — signed with SUPABASE_JWT_SECRET.
      // guardian_uid is included in payload; we do NOT log it.
      const token         = await buildUnsubscribeToken(guardianUid)
      const unsubscribeUrl = `${APP_URL}/api/guardian/unsubscribe?token=${token}`

      let subject: string
      let html: string

      if (row.event_type === 'course_completed') {
        ;({ subject, html } = buildCourseCompletedEmail(
          studentName,
          courseTitle,
          portalUrl,
          unsubscribeUrl,
        ))
      } else {
        ;({ subject, html } = buildBadgeAwardedEmail(
          studentName,
          badgeName,
          portalUrl,
          unsubscribeUrl,
        ))
      }

      try {
        const result = await resend.emails.send({
          from:    EMAIL_FROM,
          to:      profile.email,
          subject,
          html,
        })

        if (result.error) {
          // Log without PII — only the error message and event type.
          console.error(
            '[guardian-notifications] resend error:',
            result.error.message,
            'event:', row.event_type,
          )
          rowHadFailure = true
          lastErrorMessage = result.error.message
        } else {
          sent++
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error'
        console.error(
          '[guardian-notifications] send exception:',
          message,
          'event:', row.event_type,
        )
        rowHadFailure = true
        lastErrorMessage = message
        // Continue to next guardian — partial sends are better than none.
      }
    }

    // ADR-2026-010: only mark sent_at when every guardian was actually
    // reached (sent or legitimately skipped) — a real send failure must be
    // visible and retried, not silently marked successful.
    if (!rowHadFailure) {
      await svc
        .from('guardian_notification_queue')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', row.id)
      continue
    }

    const nextAttempt = row.attempt_count + 1
    if (nextAttempt >= MAX_ATTEMPTS) {
      // Exhausted retries — dead-letter. Visible to platform admins via the
      // "platform admin read" policy added in the same migration as these columns.
      await svc
        .from('guardian_notification_queue')
        .update({
          attempt_count: nextAttempt,
          failed_at:     new Date().toISOString(),
          last_error:    lastErrorMessage.slice(0, 500),
        })
        .eq('id', row.id)
    } else {
      // Leave sent_at/failed_at null so the row is picked up again on a
      // later cron tick; push debounce_until forward so a persistently-down
      // provider doesn't get hammered every invocation.
      await svc
        .from('guardian_notification_queue')
        .update({
          attempt_count:  nextAttempt,
          last_error:     lastErrorMessage.slice(0, 500),
          debounce_until: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        })
        .eq('id', row.id)
    }
  }

  return new Response(
    JSON.stringify({ processed, sent, skipped }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
