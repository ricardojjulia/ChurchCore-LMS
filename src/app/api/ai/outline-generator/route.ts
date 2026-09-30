import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, OPENROUTER_DEFAULT_MODELS, getOpenRouterApiKey } from '@/lib/openrouter'

export const runtime     = 'nodejs'
export const maxDuration = 60

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_TEXT_CHARS = 50_000

const SYSTEM_PROMPT =
  'You are an expert instructional designer and curriculum specialist for Christian and religious education. ' +
  'Your task is to transform provided curriculum notes, syllabus materials, sermon series, or course topics ' +
  'into a fully-realized course structure with COMPLETE, HIGH-QUALITY, SUBSTANTIVE content for every module and block.\n\n' +
  'CRITICAL INSTRUCTIONS:\n' +
  '1. Generate 3-6 cohesive modules with 2-5 carefully sequenced blocks each (page, quiz, discussion, or assignment).\n' +
  '2. Maintain the theological perspective (Evangelical/Biblical Christian worldview, pastoral ministry) and regional/cultural context (e.g., Latin American context if mentioned).\n' +
  '3. MATCH THE LANGUAGE of the user input (e.g. if provided in Spanish, write everything in Spanish; if in English, write in English).\n' +
  '4. POPULATE COMPLETE CONTENT for every block (no empty placeholders):\n' +
  '   - For "page" (or "text") blocks: write rich HTML lesson content in "content.body" (use <h3>, <p>, <blockquote> for Bible scriptures with book/chapter/verse references, <ul>/<li> for practical applications, <strong> for key concepts). Provide 2-4 comprehensive paragraphs of deep theological and practical instruction.\n' +
  '   - For "discussion" blocks: write an open-ended reflection prompt in "content.prompt" and set "content.max_score": 10.\n' +
  '   - For "assignment" blocks: write actionable deliverables, guidelines, and reflection requirements in "content.instructions", set "content.max_points": 100, and "content.submission_type": "both".\n' +
  '   - For "quiz" blocks: provide 2-4 multiple-choice questions in "content.questions", each with "id", "text", "type": "multiple_choice", "options" (array of 4 choices), "correct_index" (0-3), "points": 10, and "explanation".\n\n' +
  'OUTPUT FORMAT:\n' +
  'Respond with ONLY a valid JSON object matching this schema:\n' +
  '{\n' +
  '  "course_title": string,\n' +
  '  "course_description": string,\n' +
  '  "modules": [\n' +
  '    {\n' +
  '      "title": string,\n' +
  '      "blocks": [\n' +
  '        {\n' +
  '          "title": string,\n' +
  '          "type": "page" | "quiz" | "discussion" | "assignment",\n' +
  '          "objective": string,\n' +
  '          "content": {\n' +
  '            "body": string,\n' +
  '            "prompt": string,\n' +
  '            "instructions": string,\n' +
  '            "questions": [{ "id": string, "text": string, "type": "multiple_choice", "options": [string, string, string, string], "correct_index": number, "points": number, "explanation": string }]\n' +
  '          }\n' +
  '        }\n' +
  '      ]\n' +
  '    }\n' +
  '  ]\n' +
  '}\n' +
  'Do not include any text outside the JSON object.'

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

  // Call OpenRouter with intelligent cost-effective model routing
  const result = await callOpenRouter({
    task: 'outline',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Please generate a comprehensive, fully-written course curriculum from this source material:\n\n${promptContent}` },
    ],
    temperature: 0.3,
    max_tokens: 6000,
    response_format: { type: 'json_object' },
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
