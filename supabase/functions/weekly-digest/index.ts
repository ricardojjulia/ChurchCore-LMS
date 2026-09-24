// weekly-digest Edge Function
// Schedule: every Monday 8:00 AM UTC (0 8 * * 1)
// Sends a weekly learning summary email to opted-in active users.
// Auth: CRON_SECRET bearer token — no JWT required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { isDeliverableAddress, rejectUnlessCron } from '../_shared/cron-auth.ts'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const EMAIL_FROM    = Deno.env.get('EMAIL_FROM')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET')!
const APP_URL       = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

// Names and AI output are interpolated into HTML: escape them.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
}

Deno.serve(async (req) => {
  const denied = rejectUnlessCron(req)
  if (denied) return denied

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Active students who have not opted out (profiles.email_digest_enabled,
  // default true — the same preference the notification digest honours). The
  // settings.notifications.weekly_summary flag read here before was never
  // written anywhere, so no one ever qualified.
  const { data: allProfiles, error: profileErr } = await svc
    .from('profiles')
    .select('uid, display_name, auth_id, org_id')
    .eq('status', 'active')
    .eq('role', 'student')
    .eq('email_digest_enabled', true)
    .not('org_id', 'is', null)

  if (profileErr) {
    return new Response(JSON.stringify({ error: 'Failed to load recipients' }), { status: 500 })
  }

  const optedIn = allProfiles ?? []

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const profile of optedIn) {
    try {
      // Get email from auth.users
      const { data: authUser } = await svc.auth.admin.getUserById(profile.auth_id)
      const email = authUser?.user?.email
      if (!isDeliverableAddress(email)) { skipped++; continue }

      // Request the summary from the app's scheduler route. (It used to call the
      // student-facing /api/ai/weekly-summary, which requires a user session,
      // so every request was rejected and no digest was ever sent.)
      const summaryRes = await fetch(`${APP_URL}/api/cron/weekly-summary`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'x-cron-secret': CRON_SECRET,
        },
        body: JSON.stringify({ uid: profile.uid }),
      })

      if (!summaryRes.ok) { failed++; continue }
      const { summary, coursesInProgress } = await summaryRes.json()
      if (!summary) { skipped++; continue }

      // Send via Resend
      const emailRes = await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${RESEND_KEY}`,
        },
        body: JSON.stringify({
          from:    EMAIL_FROM,
          to:      [email],
          subject: 'Your weekly learning summary — ChurchCore LMS',
          html: `
            <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:40px 24px;color:#1e293b">
              <h1 style="font-size:22px;font-weight:700;margin-bottom:4px">Your weekly learning summary</h1>
              <p style="color:#64748b;font-size:14px;margin-bottom:24px">
                Hi ${escapeHtml(profile.display_name ?? 'there')} — here's what's been happening in your courses.
                ${(coursesInProgress ?? 0) > 0 ? `You have ${coursesInProgress} course(s) in progress.` : ''}
              </p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;font-size:14px;line-height:1.7;white-space:pre-wrap;color:#334155">
${escapeHtml(summary)}
              </div>
              <a href="${APP_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px;margin-top:28px">
                Continue Learning
              </a>
              <p style="color:#94a3b8;font-size:12px;margin-top:32px">
                To stop these emails, turn off “Weekly progress email” on <a href="${APP_URL}/profile" style="color:#475569">your profile</a>.
              </p>
            </div>
          `,
        }),
      })

      if (emailRes.ok) sent++; else failed++
    } catch {
      failed++
    }
  }

  return new Response(
    JSON.stringify({ total: optedIn.length, sent, failed, skipped }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})
