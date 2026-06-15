import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'

// Called weekly by a cron job (Vercel Cron, GitHub Actions, etc.)
// Header: Authorization: Bearer <CRON_SECRET>
//
// Vercel cron setup in vercel.json:
// { "crons": [{ "path": "/api/digest", "schedule": "0 8 * * 1" }] }
// Then set CRON_SECRET in Vercel env vars and pass as CRON_SECRET header
// from your job runner, or rely on Vercel's built-in auth header injection.

export async function GET(request: Request) {
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 503 })
  }

  const supabase = createServiceClient()
  const siteUrl  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://churchcore.app'
  const from     = process.env.RESEND_FROM_EMAIL ?? 'ChurchCore LMS <noreply@churchcore.app>'

  const { data: students, error: studentsErr } = await supabase
    .from('profiles')
    .select('uid, display_name, email')
    .eq('role', 'student')
    .eq('status', 'active')
    .eq('email_digest_enabled', true)
    .not('email', 'is', null)

  if (studentsErr) {
    return NextResponse.json({ error: studentsErr.message }, { status: 500 })
  }
  if (!students?.length) {
    return NextResponse.json({ sent: 0, total: 0 })
  }

  const { Resend } = await import('resend')
  const resend = new Resend(process.env.RESEND_API_KEY)

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const now     = new Date().toISOString()

  let sent = 0

  for (const student of students) {
    const [
      { count: unreadNotifs },
      { count: newGrades },
      { data: newAnnouncements },
    ] = await Promise.all([
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', student.uid)
        .eq('is_read', false)
        .eq('is_dismissed', false)
        .gte('created_at', weekAgo),
      supabase
        .from('block_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', student.uid)
        .eq('status', 'graded')
        .gte('graded_at', weekAgo),
      supabase
        .from('announcements')
        .select('title')
        .eq('is_published', true)
        .lte('publish_at', now)
        .gte('publish_at', weekAgo)
        .order('publish_at', { ascending: false })
        .limit(3),
    ])

    if (!unreadNotifs && !newGrades && !newAnnouncements?.length) continue

    const name = student.display_name ?? 'Student'
    const announcementItems = (newAnnouncements ?? [])
      .map((a: { title: string }) => `<li style="margin-bottom:4px">${a.title}</li>`)
      .join('')

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:0">
  <div style="max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#4f46e5;padding:24px 28px">
      <p style="color:white;font-size:18px;font-weight:800;margin:0">ChurchCore LMS</p>
      <p style="color:#c7d2fe;font-size:13px;margin:4px 0 0">Weekly Summary</p>
    </div>
    <div style="padding:28px">
      <h2 style="color:#1e293b;font-size:16px;margin:0 0 8px">Hi ${name},</h2>
      <p style="color:#64748b;font-size:14px;margin:0 0 24px">
        Here's a quick look at what happened in your LMS this week.
      </p>

      ${unreadNotifs ? `
      <div style="background:#eff6ff;border-radius:10px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px">
        <span style="font-size:20px">🔔</span>
        <p style="margin:0;font-size:14px;color:#1d4ed8">
          <strong>${unreadNotifs}</strong> unread notification${unreadNotifs !== 1 ? 's' : ''}
        </p>
      </div>` : ''}

      ${newGrades ? `
      <div style="background:#f0fdf4;border-radius:10px;padding:14px 16px;margin-bottom:12px;display:flex;align-items:center;gap:12px">
        <span style="font-size:20px">📝</span>
        <p style="margin:0;font-size:14px;color:#166534">
          <strong>${newGrades}</strong> assignment${newGrades !== 1 ? 's' : ''} graded this week
        </p>
      </div>` : ''}

      ${announcementItems ? `
      <div style="background:#fff7ed;border-radius:10px;padding:14px 16px;margin-bottom:12px">
        <p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#9a3412">📢 New announcements</p>
        <ul style="margin:0;padding-left:20px;font-size:14px;color:#7c2d12">${announcementItems}</ul>
      </div>` : ''}

      <a href="${siteUrl}/dashboard"
         style="display:inline-block;margin-top:16px;background:#4f46e5;color:white;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">
        Go to Dashboard →
      </a>

      <p style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">
        You're receiving this because weekly digests are enabled on your account.<br>
        <a href="${siteUrl}/profile" style="color:#6366f1">Manage email preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`

    try {
      await resend.emails.send({
        from,
        to:      student.email!,
        subject: `Your weekly ChurchCore LMS summary`,
        html,
      })
      await supabase
        .from('profiles')
        .update({ last_digest_sent_at: now })
        .eq('uid', student.uid)
      sent++
    } catch (err) {
      console.error(`[digest] Failed for ${student.email}:`, err)
    }
  }

  return NextResponse.json({ sent, total: students.length })
}
