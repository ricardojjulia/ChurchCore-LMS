import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import { parseMultipleDocuments } from '@/lib/document-parser'
import {
  SYNTHESIS_SYSTEM_PROMPT,
  buildSynthesisUserPrompt,
  type MultiDocumentSynthesizerInput,
  type MultiDocumentSynthesizedCourse,
} from '@/lib/theology/multi-document-synthesizer'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_TOTAL_FILES = 10
const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10 MB per file
const MAX_TOTAL_TEXT_CHARS = 120_000

export async function POST(req: NextRequest) {
  // Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Role check — students cannot call course generation
  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Rate limit
  const rl = await checkLimit(outlineLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Rate limit reached. You can synthesize up to 5 courses per hour.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rl.retryAfter) },
      }
    )
  }

  // OpenRouter key check
  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return Response.json(
      { error: 'AI service is not configured. Please set OPENROUTER_API_KEY in server environment variables.' },
      { status: 503 }
    )
  }

  // Parse body
  let body: {
    files?: Array<{ name: string; base64: string }>
    rawDocuments?: Array<{ name: string; text: string }>
    courseTitleHint?: string
    targetAudience?: string
    theologicalTradition?: string
    pacingWeeks?: number
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { files = [], rawDocuments = [], courseTitleHint, targetAudience, theologicalTradition, pacingWeeks } = body

  if (files.length === 0 && rawDocuments.length === 0) {
    return Response.json({ error: 'Please upload at least one document or provide text files.' }, { status: 400 })
  }

  if (files.length + rawDocuments.length > MAX_TOTAL_FILES) {
    return Response.json({ error: `Maximum of ${MAX_TOTAL_FILES} files allowed per synthesis request.` }, { status: 400 })
  }

  // Convert files to buffers and parse
  const fileBuffers: Array<{ name: string; buffer: Buffer }> = []

  for (const f of files) {
    if (!f.name || !f.base64) continue
    const buf = Buffer.from(f.base64, 'base64')
    if (buf.length > MAX_FILE_BYTES) {
      return Response.json({ error: `File "${f.name}" exceeds maximum allowed size (10 MB).` }, { status: 400 })
    }
    fileBuffers.push({ name: f.name, buffer: buf })
  }

  for (const r of rawDocuments) {
    if (!r.name || !r.text) continue
    const buf = Buffer.from(r.text, 'utf-8')
    fileBuffers.push({ name: r.name, buffer: buf })
  }

  const batchParsed = await parseMultipleDocuments(fileBuffers)

  if (!batchParsed.combinedText.trim()) {
    return Response.json({ error: 'Could not extract readable text from provided documents.' }, { status: 400 })
  }

  const boundedSourceText = batchParsed.combinedText.slice(0, MAX_TOTAL_TEXT_CHARS)

  const synthesisInput: MultiDocumentSynthesizerInput = {
    combinedSourceText: boundedSourceText,
    sourceFiles: batchParsed.documents.map((d) => ({
      fileName: d.fileName,
      title: d.title,
      charCount: d.charCount,
    })),
    courseTitleHint,
    targetAudience,
    theologicalTradition,
    pacingWeeks,
  }

  const userPrompt = buildSynthesisUserPrompt(synthesisInput)

  const result = await callOpenRouter({
    task: 'outline',
    messages: [
      { role: 'system', content: SYNTHESIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
  })

  if (!result.ok || !result.text) {
    return Response.json(
      { error: result.error || 'Course synthesis failed. Please try again.' },
      { status: result.status || 502 }
    )
  }

  let course: MultiDocumentSynthesizedCourse
  try {
    const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    course = JSON.parse(cleaned)
  } catch {
    return Response.json({ error: 'AI returned an invalid JSON response. Please try again.' }, { status: 500 })
  }

  if (!course || typeof course !== 'object' || !course.course_title || !Array.isArray(course.modules)) {
    return Response.json({ error: 'AI returned an incomplete course structure. Please try again.' }, { status: 500 })
  }

  return Response.json({
    course,
    sourceDocuments: batchParsed.documents.map((d) => ({
      fileName: d.fileName,
      title: d.title,
      charCount: d.charCount,
    })),
  })
}
