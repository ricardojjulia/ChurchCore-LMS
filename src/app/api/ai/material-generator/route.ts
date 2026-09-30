import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import { textToTiptapDoc } from '@/lib/document-parser'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_TEXT_CHARS = 50_000

const SYSTEM_PROMPT =
  'You are an expert curriculum author, instructional designer, and theological educator for Christian ministry and academic programs. ' +
  'Your task is to write a rich, substantive, beautifully structured educational reading material for a course module or lesson.\n\n' +
  'CRITICAL INSTRUCTIONS:\n' +
  '1. Provide a clear, compelling material title in "title".\n' +
  '2. Write comprehensive, in-depth educational content in "markdown_body" with:\n' +
  '   - Clear subheadings (## Subheading, ### Subheading)\n' +
  '   - Thorough narrative explanations (2-5 detailed paragraphs per section)\n' +
  '   - Scripture citations and blockquotes (> Quote with book, chapter, verse) when relevant\n' +
  '   - Bulleted or numbered actionable takeaways\n' +
  '   - Reflection & discussion questions at the end\n' +
  '3. MATCH THE LANGUAGE of the user input (e.g. if Spanish, write in Spanish; if English, write in English).\n\n' +
  'OUTPUT FORMAT:\n' +
  'Respond with ONLY a valid JSON object matching this schema:\n' +
  '{\n' +
  '  "title": string,\n' +
  '  "markdown_body": string\n' +
  '}\n' +
  'Do not include any other text outside the JSON object.'

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Role check — staff only
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
      { error: 'Rate limit reached. Please wait before generating more materials.' },
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
  let body: { prompt?: string; courseTitle?: string; currentContent?: string; fileBase64?: string; fileType?: string }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { prompt, courseTitle, currentContent, fileBase64, fileType } = body

  if (!prompt && !fileBase64 && !currentContent) {
    return Response.json({ error: 'Please provide a topic, prompt, or file.' }, { status: 400 })
  }

  let userMessage = ''
  if (courseTitle) {
    userMessage += `Course: ${courseTitle}\n`
  }
  if (prompt) {
    userMessage += `Topic / Instructions:\n${prompt}\n\n`
  }
  if (currentContent) {
    userMessage += `Existing Draft Notes:\n${currentContent.slice(0, MAX_TEXT_CHARS)}\n\n`
  }
  if (fileBase64) {
    const decoded = Buffer.from(fileBase64, 'base64')
    if (decoded.length > MAX_FILE_BYTES) {
      return Response.json({ error: 'File too large — maximum 5 MB.' }, { status: 400 })
    }
    const extracted = decoded.toString('utf-8').replace(/[^\x20-\x7E\s\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
    userMessage += `Uploaded Reference Material:\n${extracted.slice(0, MAX_TEXT_CHARS)}\n\n`
  }

  const result = await callOpenRouter({
    task: 'outline',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage.trim() },
    ],
    temperature: 0.3,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  })

  if (!result.ok || !result.text) {
    return Response.json(
      { error: result.error || 'Material generation failed. Please try again.' },
      { status: result.status || 502 }
    )
  }

  // Parse JSON from response
  let parsed: any
  try {
    const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    return Response.json({ error: 'AI returned an unreadable response. Please try again.' }, { status: 500 })
  }

  if (typeof parsed !== 'object' || !parsed || !parsed.title || !parsed.markdown_body) {
    return Response.json({ error: 'AI returned an invalid material format. Please try again.' }, { status: 500 })
  }

  const tiptapContent = textToTiptapDoc(parsed.markdown_body)

  return Response.json({
    title: parsed.title,
    text: parsed.markdown_body,
    tiptapContent,
  })
}
