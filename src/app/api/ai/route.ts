import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tutorLimiter, checkLimit } from '@/lib/rate-limit'

export const runtime = 'edge'

// Anthropic passthrough for HQ (staff-only). This route was previously
// unauthenticated and forwarded any request body with the server's API key —
// an open proxy to the account (and with Upstash unset, not even rate limited).
// It now requires a signed-in staff user and only forwards an allowlisted
// model, a capped max_tokens, and the fields HQ actually sends.
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6'])
const MAX_TOKENS_CAP = 16_000
const STAFF_ROLES = ['admin', 'manager', 'teacher']

type Message = { role: 'user' | 'assistant'; content: string }

function parseBody(raw: unknown):
  | { ok: true; body: { model: string; max_tokens: number; stream: boolean; system?: string; messages: Message[] } }
  | { ok: false } {
  if (!raw || typeof raw !== 'object') return { ok: false }
  const b = raw as Record<string, unknown>
  if (typeof b.model !== 'string' || !ALLOWED_MODELS.has(b.model)) return { ok: false }
  if (!Array.isArray(b.messages) || b.messages.length === 0) return { ok: false }
  const messages = b.messages.every(
    (m) => m && typeof m === 'object'
      && ((m as Message).role === 'user' || (m as Message).role === 'assistant')
      && typeof (m as Message).content === 'string',
  )
  if (!messages) return { ok: false }
  if (b.system !== undefined && typeof b.system !== 'string') return { ok: false }
  const requested = typeof b.max_tokens === 'number' && b.max_tokens > 0 ? b.max_tokens : 1024
  return {
    ok: true,
    body: {
      model: b.model,
      max_tokens: Math.min(Math.floor(requested), MAX_TOKENS_CAP),
      stream: b.stream === true,
      ...(typeof b.system === 'string' ? { system: b.system } : {}),
      messages: (b.messages as Message[]).map((m) => ({ role: m.role, content: m.content })),
    },
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()
  if (!pr || !STAFF_ROLES.includes(pr.role)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const rl = await checkLimit(tutorLimiter, `hq:${user.id}`)
  if (rl.limited) {
    return Response.json(
      { error: 'Too many requests.' },
      {
        status: 429,
        headers: {
          'Retry-After':           String(rl.retryAfter),
          'X-RateLimit-Limit':     String(rl.limit),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const parsed = parseBody(raw)
  if (!parsed.ok) return Response.json({ error: 'Invalid request body.' }, { status: 400 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return Response.json({ error: 'AI is not configured.' }, { status: 503 })

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(parsed.body),
  })

  if (!res.ok) return Response.json({ error: 'AI request failed.' }, { status: 502 })

  // When Anthropic returns an SSE stream, pipe it straight through.
  // This is what eliminates the token-limit cut-off: the client receives
  // each delta in real time instead of waiting for a buffered JSON blob.
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  const data = await res.json()
  return Response.json(data, { status: res.status })
}
