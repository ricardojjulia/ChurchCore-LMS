import { NextRequest } from 'next/server'
import { createClient }        from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { feedbackLimiter, checkLimit } from '@/lib/rate-limit'
import { validateFeedbackPayload, computeFingerprint } from '@/lib/feedback'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // D2: Re-check the feature gate server-side, independent of any client state.
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Parse and validate the request body. `.catch(() => null)` turns a JSON parse
  // failure into a null that validateFeedbackPayload will reject with 'Invalid request'.
  const parsed = validateFeedbackPayload(await req.json().catch(() => null))
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const body = parsed.data

  try {
    // D3: Identity is always server-derived — the request body is never consulted for user fields.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    let userEmail: string | null = null
    let userRole:  string | null = null

    if (user) {
      userEmail = user.email ?? null
      // Read role from profile_roles (RLS hot-path table) — never from profiles.
      // (CLAUDE.md rule 2: never reference profiles in RLS policies or identity derivation)
      const { data: roleRow } = await supabase
        .from('profile_roles')
        .select('role')
        .eq('auth_id', user.id)
        .maybeSingle()
      userRole = roleRow?.role ?? null
    }

    // D4: Rate limit keyed by server-derived identity, not client-supplied state.
    // Authenticated callers are keyed by their verified user id (cannot be forged
    // by rotating a client-generated sessionId). Anonymous callers are keyed by
    // client IP (from the platform-set x-forwarded-for header) so a fresh
    // sessionId alone can't reset the limit; sessionId is only the last resort
    // for local/dev environments with no proxy header.
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const rateLimitKey = user?.id ?? clientIp ?? body.sessionId
    const { limited } = await checkLimit(feedbackLimiter, rateLimitKey)
    if (limited) {
      return Response.json({ error: 'Rate limited' }, { status: 429 })
    }

    // D3: Fingerprint is always computed server-side from normalized fields.
    // Any fingerprint field in the request body is simply never read.
    // Manual ERROR reports (FeedbackButton) arrive in `note`, not `errorMessage` —
    // fall back to `note` so distinct manual error reports don't all collapse to
    // one fingerprint, and so the reported text isn't silently dropped below.
    const errorDetail = body.errorMessage ?? body.note ?? ''
    const detail = body.category === 'ERROR' ? errorDetail : (body.note ?? '')
    const fingerprint = computeFingerprint(body.route, body.category, detail)

    // All writes use the service client — never exposed to the browser.
    const service = createServiceClient()

    const { data: existing, error: selectError } = await service
      .from('platform_feedback')
      .select('id, hit_count')
      .eq('fingerprint', fingerprint)
      .maybeSingle()

    if (selectError) throw selectError

    if (existing) {
      // Upsert: increment hit_count and reopen a previously-processed row.
      const { error: updateError } = await service
        .from('platform_feedback')
        .update({
          hit_count:               existing.hit_count + 1,
          breadcrumbs:             body.breadcrumbs,
          session_id:              body.sessionId,
          user_email:              userEmail,
          user_role:               userRole,
          app_version:             body.appVersion,
          session_duration_seconds: body.sessionDurationSeconds,
          processed:               false,
          triage_action:           null,
          updated_at:              new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateError) throw updateError
    } else {
      const { error: insertError } = await service
        .from('platform_feedback')
        .insert({
          fingerprint,
          session_id:              body.sessionId,
          route:                   body.route,
          category:                body.category,
          error_message:           body.category === 'ERROR' ? (errorDetail || null) : null,
          note:                    body.category === 'ERROR' ? null : (body.note ?? null),
          breadcrumbs:             body.breadcrumbs,
          user_email:              userEmail,
          user_role:               userRole,
          app_version:             body.appVersion,
          session_duration_seconds: body.sessionDurationSeconds,
        })

      if (insertError) throw insertError
    }

    return Response.json({ ok: true }, { status: 201 })
  } catch {
    // Never leak raw Supabase or driver errors to the client. (CLAUDE.md)
    return Response.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
