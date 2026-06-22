import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'

export const runtime     = 'nodejs'
export const maxDuration = 30

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_TEXT_CHARS = 50_000

const SYSTEM_PROMPT =
  'You are a curriculum design assistant for religious education. Given the provided content, ' +
  'structure it as a course outline. Respond with ONLY a valid JSON object matching exactly: ' +
  '{ "course_title": string, "course_description": string, "modules": [{ "title": string, ' +
  '"blocks": [{ "title": string, "type": "text" | "quiz" | "discussion", "objective": string }] }] }. ' +
  'Generate 3-8 modules with 2-6 blocks each. Do not include any text outside the JSON object.'

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Role check — students cannot call this
  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit: 5 requests per hour per user
  const rl = await checkLimit(outlineLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Rate limit reached. You can generate 5 outlines per hour.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      }
    )
  }

  // Parse body
  let body: { text?: string; fileBase64?: string; fileType?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { text, fileBase64, fileType } = body

  if (!text && !fileBase64) {
    return Response.json({ error: 'Provide text content or a file.' }, { status: 400 })
  }

  // Build Anthropic user message content
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Anthropic message content type varies by modality
  const userContent: any[] = []

  if (fileBase64) {
    // Validate file size
    const decoded = Buffer.from(fileBase64, 'base64')
    if (decoded.length > MAX_FILE_BYTES) {
      return Response.json({ error: 'File too large — maximum 5 MB.' }, { status: 400 })
    }

    // Verify PDF magic bytes
    if (fileType === 'application/pdf') {
      const magic = decoded.slice(0, 4).toString('ascii')
      if (!magic.startsWith('%PDF')) {
        return Response.json({ error: 'File does not appear to be a valid PDF.' }, { status: 400 })
      }
      userContent.push({
        type:   'document',
        source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 },
      })
      userContent.push({ type: 'text', text: 'Please generate a course outline from this document.' })
    } else {
      // Plain text file — decode and treat as text
      const textContent = decoded.toString('utf-8').slice(0, MAX_TEXT_CHARS)
      userContent.push({ type: 'text', text: textContent })
    }
  } else if (text) {
    if (text.length > MAX_TEXT_CHARS) {
      return Response.json({ error: `Text too long — maximum ${MAX_TEXT_CHARS.toLocaleString()} characters.` }, { status: 400 })
    }
    userContent.push({ type: 'text', text })
  }

  // Call Anthropic API via fetch (no SDK dependency)
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         process.env.ANTHROPIC_API_KEY ?? '',
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'pdfs-2024-09-25', // required for document content type
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-6',
      max_tokens: 2000,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: userContent }],
    }),
  })

  if (!anthropicRes.ok) {
    return Response.json({ error: 'Outline generation failed. Please try again.' }, { status: 502 })
  }

  const anthropicData = await anthropicRes.json()
  const rawText = anthropicData?.content?.[0]?.text ?? ''

  // Parse JSON from response
  let outline: unknown
  try {
    // Strip any markdown code fences the model may add despite the prompt
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    outline = JSON.parse(cleaned)
  } catch {
    return Response.json({ error: 'AI returned an unreadable response. Please try again.' }, { status: 500 })
  }

  // Basic schema validation
  if (
    typeof outline !== 'object' || outline === null ||
    !('course_title' in outline) ||
    !('modules' in outline) ||
    !Array.isArray((outline as Record<string, unknown>).modules)
  ) {
    return Response.json({ error: 'AI returned an invalid outline structure. Please try again.' }, { status: 500 })
  }

  return Response.json({ outline })
}
