import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { heavyLimiter, checkLimit } from '@/lib/rate-limit'
import { buildWeeklySummary } from '@/lib/weekly-summary'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rl = await checkLimit(heavyLimiter, user.id)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before trying again.' },
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

  const { data: perf } = await supabase.rpc('get_my_academic_performance')
  const { data: gpa  } = await supabase.rpc('get_my_overall_gpa')

  const result = await buildWeeklySummary(perf, gpa)
  if (!result.ok) return NextResponse.json({ error: 'AI unavailable' }, { status: result.status })
  return NextResponse.json({ summary: result.summary })
}
