import { NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { callOpenRouter, getOpenRouterApiKey } from '@/lib/openrouter'
import {
  SPIRITUAL_FORMATION_PULSE_PROMPT,
  type SpiritualGrowthTrend,
} from '@/lib/theology/spiritual-formation'

export const runtime = 'nodejs'
export const maxDuration = 45

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

  const apiKey = getOpenRouterApiKey()
  if (!apiKey) {
    return Response.json({ error: 'AI service not configured.' }, { status: 503 })
  }

  let body: { cohortId?: string; courseId?: string; anonymizedReflections?: string[] }
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON request' }, { status: 400 })
  }

  const reflections = body.anonymizedReflections ?? []
  if (reflections.length === 0) {
    return Response.json(
      { error: 'At least one anonymous reflection is required for pulse analysis.' },
      { status: 400 }
    )
  }

  const userPrompt = `
ANONYMIZED COHORT REFLECTIONS & DISCUSSION THEMES:
${reflections.map((r, i) => `[Reflection ${i + 1}]: ${r}`).join('\n\n')}
`

  const aiResult = await callOpenRouter({
    task: 'summary',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SPIRITUAL_FORMATION_PULSE_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })

  if (!aiResult.ok || !aiResult.json) {
    return Response.json(
      { error: aiResult.error || 'Failed to generate spiritual formation pulse.' },
      { status: 502 }
    )
  }

  const trend = aiResult.json as SpiritualGrowthTrend

  return Response.json({
    success: true,
    data: trend,
    modelUsed: aiResult.modelUsed,
  })
}
