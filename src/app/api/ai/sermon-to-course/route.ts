import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { outlineLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import {
  SERMON_TRANSFORMER_PROMPT,
  type SermonInput,
  type GeneratedSermonCourse,
} from '@/lib/theology/sermon-transformer'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_TEXT_CHARS = 70_000

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pr } = await supabase
    .from('profile_roles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (!pr || !['admin', 'manager', 'teacher'].includes(pr.role)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rl = await checkLimit(outlineLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Generation limit reached. Please wait before compiling another sermon.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rl.retryAfter),
          'X-RateLimit-Limit': String(rl.limit),
        },
      }
    )
  }

  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return Response.json({ error: 'AI service not configured.' }, { status: 503 })
  }

  let body: SermonInput
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 })
  }

  if (!body.sermonText || body.sermonText.trim().length < 50) {
    return Response.json(
      { error: 'Sermon manuscript or transcript must contain at least 50 characters.' },
      { status: 400 }
    )
  }

  const truncatedText = body.sermonText.slice(0, MAX_TEXT_CHARS)

  const userPrompt = `
Transform the following sermon into an interactive discipleship course.

SERMON METADATA:
Title: ${body.sermonTitle || 'Untitled Sermon'}
Speaker: ${body.speakerName || 'Pastoral Team'}
Passage: ${body.passageReference || 'Scripture Text'}
Target Duration: ${body.targetDurationWeeks || 4} Weeks
Include Small Group Leader Guide: ${body.includeSmallGroupGuide ?? true}
Include Daily Devotionals: ${body.includeDailyDevotionals ?? true}
Language: ${body.language || 'en'}

SERMON TRANSCRIPT / NOTES:
${truncatedText}
`

  const aiResult = await callOpenRouter({
    task: 'outline',
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SERMON_TRANSFORMER_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  if (!aiResult.ok || !aiResult.json) {
    return Response.json(
      { error: aiResult.error || 'Failed to generate curriculum from sermon.' },
      { status: 502 }
    )
  }

  const generated = aiResult.json as GeneratedSermonCourse

  return Response.json({
    success: true,
    course: generated,
    modelUsed: aiResult.modelUsed,
  })
}
