import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { tutorLimiter, checkLimit } from '@/lib/rate-limit'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import {
  SOCRATIC_EXEGESIS_SYSTEM_PROMPT,
  type SocraticExegesisInput,
  type SocraticExegesisResult,
} from '@/lib/theology/socratic-exegesis'

export const runtime = 'nodejs'
export const maxDuration = 45

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkLimit(tutorLimiter, user.id)
  if (rl.limited) {
    return Response.json(
      { error: 'Too many queries. Please wait before asking another exegesis question.' },
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

  let body: SocraticExegesisInput
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.passage?.trim() || !body.studentQuestionOrReflection?.trim()) {
    return Response.json(
      { error: 'Both biblical passage reference and question/reflection are required.' },
      { status: 400 }
    )
  }

  const userPrompt = `
PASSAGE REFERENCE: ${body.passage}
STUDENT QUESTION / REFLECTION: ${body.studentQuestionOrReflection}
PREFERRED TRADITION: ${body.preferredTradition || 'ecumenical'}
INCLUDE ORIGINAL LANGUAGES: ${body.includeOriginalLanguages ?? true}
INCLUDE CHURCH FATHERS: ${body.includeChurchFathers ?? true}
`

  const aiResult = await callOpenRouter({
    task: 'tutor',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SOCRATIC_EXEGESIS_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  if (!aiResult.ok || !aiResult.json) {
    return Response.json(
      { error: aiResult.error || 'Failed to complete Socratic exegesis.' },
      { status: 502 }
    )
  }

  const result = aiResult.json as SocraticExegesisResult

  return Response.json({
    success: true,
    data: result,
    modelUsed: aiResult.modelUsed,
  })
}
