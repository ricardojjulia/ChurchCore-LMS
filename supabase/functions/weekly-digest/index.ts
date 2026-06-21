// weekly-digest Edge Function
// Schedule: every Monday 8:00 AM UTC (0 8 * * 1)
// Sends a weekly learning summary email to opted-in active users.
// Auth: CRON_SECRET bearer token — no JWT required.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_KEY    = Deno.env.get('RESEND_API_KEY')!
const EMAIL_FROM    = Deno.env.get('EMAIL_FROM')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET')!
const APP_URL       = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch active users who opted into weekly summaries
  // profiles.settings->'notifications'->>'weekly_summary' = 'true'
  const { data: profiles, error: profileErr } = await svc
    .from('profiles')
    .select('uid, display_name, auth_id, org_id')
    .eq('status', 'active')
    .not('org_id', 'is', null)

  if (profileErr) {
    return new Response(JSON.stringify({ error: profileErr.message }), { status: 500 })
  }

  // Filter to opted-in users (settings JSON check done in code since
  // Supabase PostgREST JSON path filtering varies by version)
  const { data: allProfiles } = await svc
    .from('profiles')
    .select('uid, display_name, auth_id, org_id, settings')
    .eq('status', 'active')
    .not('org_id', 'is', null)

  const optedIn = (allProfiles ?? []).filter(
    (p: { settings?: { notifications?: { weekly_summary?: boolean } } }) =>
      p.settings?.notifications?.weekly_summary === true
  )

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const profile of optedIn) {
    try {
      // Get email from auth.users
      const { data: authUser } = await svc.auth.admin.getUserById(profile.auth_id)
      const email = authUser?.user?.email
      if (!email) { skipped++; continue }

      // Request weekly summary from the app API
      const summaryRes = await fetch(`${APP_URL}/api/ai/weekly-summary`, {
        method:  'GET',
        headers: {
          'x-cron-user-auth-id': profile.auth_id,
          Authorization:          `Bearer ${CRON_SECRET}`,
        },
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
                Hi ${profile.display_name ?? 'there'} — here's what's been happening in your courses.
                ${(coursesInProgress ?? 0) > 0 ? `You have ${coursesInProgress} course(s) in progress.` : ''}
              </p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;font-size:14px;line-height:1.7;white-space:pre-wrap;color:#334155">
${summary}
              </div>
              <a href="${APP_URL}/dashboard" style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:15px;margin-top:28px">
                Continue Learning
              </a>
              <p style="color:#94a3b8;font-size:12px;margin-top:32px">
                Unsubscribe: update your notification preferences in your profile settings.
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
