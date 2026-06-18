import { NextResponse } from 'next/server'

import { createServerClient } from '@/lib/supabase/server'
import type { AnalyticsEventType } from '@/types/reporting'

const VALID_EVENT_TYPES = new Set<AnalyticsEventType>([
  'module_view',
  'module_complete',
  'assignment_submit',
  'quiz_attempt',
  'video_watch',
  'login',
  'certificate_earned',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RATE_LIMIT_MAX = 60
const RATE_LIMIT_WINDOW_MS = 60_000
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>()

type AnalyticsEventBody = {
  eventType?: unknown
  courseId?: unknown
  moduleId?: unknown
  metadata?: unknown
}

type Profile = {
  uid: string
  org_id: string | null
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function sanitizeMetadata(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, entryValue]) => {
      return (
        typeof entryValue === 'string' ||
        typeof entryValue === 'number' ||
        typeof entryValue === 'boolean'
      )
    })
  ) as Record<string, string | number | boolean>
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key)
  }

  const bucket = rateLimitBuckets.get(userId)
  if (!bucket) {
    rateLimitBuckets.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }

  if (bucket.count >= RATE_LIMIT_MAX) return false
  bucket.count += 1
  return true
}

/**
 * Records learner analytics events through the authenticated Supabase server
 * client. The database RLS policy on `analytics_events` enforces the final
 * enrollment and organization checks, so users cannot log course-scoped events
 * for courses they are not enrolled in even if they tamper with the payload.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  let body: AnalyticsEventBody
  try {
    body = (await request.json()) as AnalyticsEventBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.eventType !== 'string' || !VALID_EVENT_TYPES.has(body.eventType as AnalyticsEventType)) {
    return NextResponse.json({ error: 'Invalid eventType' }, { status: 400 })
  }

  if (body.courseId !== undefined && body.courseId !== null && !validUuid(body.courseId)) {
    return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
  }

  if (body.moduleId !== undefined && body.moduleId !== null && !validUuid(body.moduleId)) {
    return NextResponse.json({ error: 'Invalid moduleId' }, { status: 400 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('uid, org_id')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (profileError || !profile?.org_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
  }

  if (!checkRateLimit(profile.uid)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  const { error } = await supabase.from('analytics_events').insert({
    org_id: profile.org_id,
    user_id: profile.uid,
    course_id: typeof body.courseId === 'string' ? body.courseId : null,
    module_id: typeof body.moduleId === 'string' ? body.moduleId : null,
    event_type: body.eventType,
    metadata: sanitizeMetadata(body.metadata),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  return NextResponse.json({ success: true })
}
