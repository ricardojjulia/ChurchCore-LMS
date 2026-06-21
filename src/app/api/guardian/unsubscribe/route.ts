import { type NextRequest }       from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createServiceClient }   from '@/utils/supabase/service'

export const runtime = 'nodejs'

const HTML_SUCCESS = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:480px;margin:80px auto;padding:0 24px;text-align:center">
  <h1 style="font-size:20px;font-weight:700;margin-bottom:8px">You have been unsubscribed</h1>
  <p style="color:#475569">You have been unsubscribed from guardian notifications.</p>
</body>
</html>`

const HTML_INVALID = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Invalid Link</title></head>
<body style="font-family:system-ui,sans-serif;color:#1e293b;max-width:480px;margin:80px auto;padding:0 24px;text-align:center">
  <h1 style="font-size:20px;font-weight:700;margin-bottom:8px">Link expired or invalid</h1>
  <p style="color:#475569">This unsubscribe link has expired or is invalid.</p>
</body>
</html>`

function base64urlDecode(s: string): Buffer {
  // Convert base64url → standard base64, then decode
  return Buffer.from(s, 'base64url')
}

interface TokenPayload {
  sub:          string
  guardian_uid: string
  exp:          number
}

function verifyToken(token: string): TokenPayload | null {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerB64, payloadB64, sigB64] = parts

  // Recompute expected signature over "header.payload"
  const expected = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest()

  const actual = base64urlDecode(sigB64)

  // Lengths must match before timingSafeEqual
  if (expected.length !== actual.length) return null

  if (!timingSafeEqual(expected, actual)) return null

  // Signature valid — decode payload
  let payload: TokenPayload
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf8')) as TokenPayload
  } catch {
    return null
  }

  return payload
}

export async function GET(req: NextRequest): Promise<Response> {
  const token = req.nextUrl.searchParams.get('token') ?? ''

  if (!token) {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const payload = verifyToken(token)

  if (!payload) {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Validate claims — sub must identify this as a guardian unsubscribe token
  if (payload.sub !== 'guardian-unsub') {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Check expiry
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // guardian_uid comes from our signed token — not from query params — so IDOR is not possible
  if (!payload.guardian_uid) {
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  try {
    const svc = createServiceClient()

    // Disable guardian email notifications in the profile settings JSONB column.
    // PostgREST does not expose jsonb_set directly, so we fetch current settings,
    // merge the opt-out flag in JS, then write back — leaving all other keys intact.
    const { data: profile, error: fetchError } = await svc
      .from('profiles')
      .select('settings')
      .eq('uid', payload.guardian_uid)
      .single()

    if (fetchError) {
      // Do not expose DB error details — return generic failure page
      return new Response(HTML_INVALID, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const currentSettings     = (profile?.settings     ?? {}) as Record<string, unknown>
    const currentNotifications = (currentSettings.notifications ?? {}) as Record<string, unknown>

    const mergedSettings = {
      ...currentSettings,
      notifications: {
        ...currentNotifications,
        guardian_emails: false,
      },
    }

    const { error: updateError } = await svc
      .from('profiles')
      .update({ settings: mergedSettings })
      .eq('uid', payload.guardian_uid)

    if (updateError) {
      return new Response(HTML_INVALID, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      })
    }
  } catch {
    // Never expose internal errors to the response body
    return new Response(HTML_INVALID, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  return new Response(HTML_SUCCESS, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  })
}
