import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { heavyLimiter, checkLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

interface PerfRow {
  course_title:       string
  enrollment_status:  string
  progress_percent:   number
  average_grade:      number | null
  letter_grade:       string
  gpa_points:         number | null
  total_submissions:  number
  graded_submissions: number
  is_at_risk:         boolean
}

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

  const rows = (perf ?? []) as PerfRow[]

  if (rows.length === 0) {
    return NextResponse.json({
      summary: "You haven't enrolled in any courses yet. Head to the catalog and pick something that interests you!"
    })
  }

  const atRisk    = rows.filter((r) => r.is_at_risk)
  const inProg    = rows.filter((r) => r.enrollment_status === 'in_progress')
  const completed = rows.filter((r) => r.enrollment_status === 'completed')

  const courseLines = rows.map((r) =>
    `- ${r.course_title}: ${r.progress_percent}% complete, grade ${r.average_grade !== null ? `${r.average_grade}% (${r.letter_grade})` : 'no grades yet'}, ${r.graded_submissions}/${r.total_submissions} submissions graded${r.is_at_risk ? ' ⚠ AT-RISK' : ''}`
  ).join('\n')

  const prompt = `You are a friendly, encouraging academic advisor for a church learning management system called ChurchCore LMS. Write a brief, warm weekly progress summary for this student. Be specific about their courses but keep it upbeat and motivating. Under 120 words. No bullet points — 2-3 flowing sentences.

Student data:
- Overall GPA: ${gpa !== null ? gpa : 'N/A'}
- Courses in progress: ${inProg.length}
- Courses completed: ${completed.length}
- At-risk courses: ${atRisk.length}
${courseLines}

Write the summary now:`

  // Call Anthropic directly. This used to loop back through /api/ai with no
  // user session, which only worked while /api/ai was an open proxy; it also
  // turned any network error into an unhandled 500.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI unavailable' }, { status: 503 })

  let aiRes: Response
  try {
    aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 })
  }

  if (!aiRes.ok) {
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 })
  }

  let aiData: { content?: Array<{ text?: string }> } | null = null
  try {
    aiData = await aiRes.json()
  } catch {
    return NextResponse.json({ error: 'AI unavailable' }, { status: 502 })
  }
  const summary = aiData?.content?.[0]?.text ?? 'Unable to generate summary right now.'

  return NextResponse.json({ summary })
}
