import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, OPENROUTER_DEFAULT_MODELS, getOpenRouterApiKey } from '@/lib/openrouter'

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

  // Verify AI API key is configured
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return Response.json(
      { error: 'AI service is not configured. Please set OPENROUTER_API_KEY in server environment variables.' },
      { status: 503 }
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

  let promptContent = ''

  if (fileBase64) {
    // Validate file size
    const decoded = Buffer.from(fileBase64, 'base64')
    if (decoded.length > MAX_FILE_BYTES) {
      return Response.json({ error: 'File too large — maximum 5 MB.' }, { status: 400 })
    }

    if (fileType === 'application/pdf') {
      const magic = decoded.slice(0, 4).toString('ascii')
      if (!magic.startsWith('%PDF')) {
        return Response.json({ error: 'File does not appear to be a valid PDF.' }, { status: 400 })
      }
      // For PDFs, decode printable text slice or instructions
      const extracted = decoded.toString('utf-8').replace(/[^\x20-\x7E\s\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
      promptContent = `[Uploaded Syllabus PDF Content]\n${extracted.slice(0, MAX_TEXT_CHARS)}`
    } else {
      // Plain text file
      promptContent = decoded.toString('utf-8').slice(0, MAX_TEXT_CHARS)
    }
  } else if (text) {
    if (text.length > MAX_TEXT_CHARS) {
      return Response.json({ error: `Text too long — maximum ${MAX_TEXT_CHARS.toLocaleString()} characters.` }, { status: 400 })
    }
    promptContent = text
  }

  // Call OpenRouter
  const result = await callOpenRouter({
    model: OPENROUTER_DEFAULT_MODELS.outline,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Please generate a course outline from this curriculum content:\n\n${promptContent}` },
    ],
    temperature: 0.3,
    max_tokens: 3000,
  })

  if (!result.ok || !result.text) {
    return Response.json(
      { error: result.error || 'Outline generation failed. Please try again.' },
      { status: result.status || 502 }
    )
  }

  // Parse JSON from response
  let outline: unknown
  try {
    // Strip any markdown code fences the model may add despite the prompt
    const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
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
