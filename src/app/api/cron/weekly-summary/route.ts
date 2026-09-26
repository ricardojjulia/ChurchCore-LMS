import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import { isCronRequest } from '@/lib/cron-auth'
import { buildWeeklySummary } from '@/lib/weekly-summary'

export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Scheduler-only: the weekly-digest Edge Function asks for one student's
// summary at a time. There is no user session here, so the student's rows are
// read with the service client, scoped by the uid in the body.
export async function POST(req: NextRequest) {
  if (!isCronRequest(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { uid?: unknown } | null
  const uid = typeof body?.uid === 'string' ? body.uid : ''
  if (!UUID_RE.test(uid)) return NextResponse.json({ error: 'uid is required' }, { status: 400 })

  const svc = createServiceClient()
  const { data: profile } = await svc.from('profiles').select('uid').eq('uid', uid).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: perf, error } = await svc
    .from('mv_academic_performance')
    .select('course_title, enrollment_status, progress_percent, average_grade, letter_grade, gpa_points, total_submissions, graded_submissions, is_at_risk')
    .eq('user_id', uid)
    .order('course_title')
  if (error) return NextResponse.json({ error: 'Summary unavailable' }, { status: 500 })

  const points = (perf ?? []).map((r) => r.gpa_points).filter((p): p is number => p !== null)
  const gpa = points.length ? Math.round((points.reduce((a, b) => a + b, 0) / points.length) * 100) / 100 : null

  const result = await buildWeeklySummary(perf, gpa)
  if (!result.ok) return NextResponse.json({ error: 'AI unavailable' }, { status: result.status })
  return NextResponse.json({ summary: result.summary, coursesInProgress: result.coursesInProgress })
}
