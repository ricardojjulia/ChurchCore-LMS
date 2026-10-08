import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tutorLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import {
  PENTECOST_TRANSLATION_PROMPT,
  LANGUAGE_NAMES,
  type DiscussionTranslationInput,
  type DiscussionTranslationResult,
  type SupportedPentecostLanguage,
} from '@/lib/translation/pentecost'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkLimit(tutorLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Translation rate limit reached. Please wait a moment.' },
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
    return Response.json({ error: 'AI translation service not configured.' }, { status: 503 })
  }

  let body: DiscussionTranslationInput
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request' }, { status: 400 })
  }

  if (!body.text?.trim() || !body.targetLanguage) {
    return Response.json(
      { error: 'Both text and targetLanguage are required.' },
      { status: 400 }
    )
  }

  const targetLangLabel = LANGUAGE_NAMES[body.targetLanguage as SupportedPentecostLanguage] || body.targetLanguage

  const userPrompt = `
Translate the following church community reflection or discussion post into ${targetLangLabel}.

SOURCE TEXT:
${body.text}

SOURCE LANGUAGE HINT: ${body.sourceLanguage || 'auto-detect'}
TARGET LANGUAGE: ${targetLangLabel}
`

  const aiResult = await callOpenRouter({
    task: 'summary',
    temperature: 0.1,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: PENTECOST_TRANSLATION_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  if (!aiResult.ok || !aiResult.json) {
    return Response.json(
      { error: aiResult.error || 'Failed to translate discussion post.' },
      { status: 502 }
    )
  }

  const result = aiResult.json as DiscussionTranslationResult

  return Response.json({
    success: true,
    data: result,
    modelUsed: aiResult.modelUsed,
  })
}
