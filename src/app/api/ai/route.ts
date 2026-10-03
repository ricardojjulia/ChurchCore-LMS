import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tutorLimiter, checkLimit } from '@/lib/rate-limit'
import { getOpenRouterApiKey, resolveModelChain } from '@/lib/openrouter'

export const runtime = 'edge'

const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001',
  'openai/gpt-4o-mini',
])

const MAX_TOKENS_CAP = 16_000
const MAX_SYSTEM_CHARS = 20_000
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
  if (b.system !== undefined && (typeof b.system !== 'string' || b.system.length > MAX_SYSTEM_CHARS)) return { ok: false }
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
    .eq('tenant_active', true) // staff of a suspended org get no AI access
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

  const openRouterKey = process.env.OPENROUTER_API_KEY || (process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY ? process.env.OPENAI_API_KEY : null)
  const anthropicKey  = process.env.ANTHROPIC_API_KEY

  if (!openRouterKey && !anthropicKey) {
    return Response.json({ error: 'AI is not configured.' }, { status: 503 })
  }

  // 1. Prefer OpenRouter when configured
  if (openRouterKey) {
    const modelChain = resolveModelChain('hq')
    const primaryModel = parsed.body.model === 'claude-sonnet-4-6' ? 'anthropic/claude-3.5-sonnet' : parsed.body.model
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://churchcore.app'

    const openRouterMessages = [
      ...(parsed.body.system ? [{ role: 'system' as const, content: parsed.body.system }] : []),
      ...parsed.body.messages,
    ]

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openRouterKey}`,
        'HTTP-Referer': appUrl,
        'X-Title': 'ChurchCore LMS HQ Council',
      },
      body: JSON.stringify({
        model: primaryModel,
        models: modelChain,
        messages: openRouterMessages,
        max_tokens: parsed.body.max_tokens,
        stream: parsed.body.stream,
      }),
    })

    if (!res.ok) return Response.json({ error: 'AI request failed.' }, { status: 502 })

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

  // 2. Direct Anthropic fallback
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(parsed.body),
  })

  if (!res.ok) return Response.json({ error: 'AI request failed.' }, { status: 502 })

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
