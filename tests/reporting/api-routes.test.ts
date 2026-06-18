import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST as postAnalyticsEvent } from '@/app/api/analytics/events/route'
import {
  DELETE as deleteReportArtifact,
  GET as getReportArtifacts,
} from '@/app/api/reports/artifacts/route'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getReportArtifactsForUser } from '@/lib/reporting/report-queries'
import type { ReportArtifact } from '@/types/reporting'

type SupabaseError = { message: string }

const mocks = vi.hoisted(() => ({
  serverClient: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
  serviceClient: {
    from: vi.fn(),
  },
  getReportArtifactsForUser: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => mocks.serverClient),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.serviceClient),
}))

vi.mock('@/lib/reporting/report-queries', () => ({
  getReportArtifactsForUser: vi.fn((...args: unknown[]) =>
    mocks.getReportArtifactsForUser(...args)
  ),
}))

const authId = '20000000-0000-4000-8000-000000000001'
const userId = '30000000-0000-4000-8000-000000000001'
const otherUserId = '30000000-0000-4000-8000-000000000002'
const orgId = '10000000-0000-4000-8000-000000000001'
const courseId = '40000000-0000-4000-8000-000000000001'
const artifactId = '50000000-0000-4000-8000-000000000001'

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://churchcore.test/api', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function responseJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

function profileQuery(
  profile: { uid: string; role?: string; org_id: string | null } | null,
  error: SupabaseError | null = null
) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: profile, error })),
  }
  return chain
}

function analyticsInsertQuery(error: SupabaseError | null = null) {
  return {
    insert: vi.fn(async () => ({ data: null, error })),
  }
}

function selectArtifactQuery(row: { id: string; org_id: string; generated_by: string | null } | null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  }
  return chain
}

function updateArtifactQuery(error: SupabaseError | null = null) {
  const chain = {
    update: vi.fn(() => chain),
    eq: vi.fn(async () => ({ data: null, error })),
  }
  return chain
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.serverClient.auth.getUser.mockResolvedValue({ data: { user: { id: authId } } })
})

describe('POST /api/analytics/events', () => {
  it('SEC-RPT api: rejects unauthenticated analytics events', async () => {
    mocks.serverClient.auth.getUser.mockResolvedValue({ data: { user: null } })

    const response = await postAnalyticsEvent(jsonRequest('POST', { eventType: 'login' }))

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({ error: 'Unauthorized' })
  })

  it('SEC-RPT api: rejects invalid event types before insert', async () => {
    const response = await postAnalyticsEvent(jsonRequest('POST', { eventType: 'admin_override' }))

    expect(response.status).toBe(400)
    expect(mocks.serverClient.from).not.toHaveBeenCalled()
  })

  it('SEC-RPT api: rejects invalid UUIDs before insert', async () => {
    const response = await postAnalyticsEvent(
      jsonRequest('POST', { eventType: 'module_view', courseId: 'not-a-uuid' })
    )

    expect(response.status).toBe(400)
    expect(await responseJson(response)).toEqual({ error: 'Invalid courseId' })
  })

  it('SEC-RPT api: sanitizes metadata and inserts through the RLS-authenticated client', async () => {
    const profile = profileQuery({ uid: userId, org_id: orgId })
    const analytics = analyticsInsertQuery()
    mocks.serverClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profile
      if (table === 'analytics_events') return analytics
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await postAnalyticsEvent(
      jsonRequest('POST', {
        eventType: 'module_complete',
        courseId,
        metadata: {
          allowedString: 'yes',
          allowedNumber: 7,
          allowedBoolean: true,
          rejectedObject: { admin: true },
          rejectedArray: ['x'],
        },
      })
    )

    expect(response.status).toBe(200)
    expect(await responseJson(response)).toEqual({ success: true })
    expect(createServerClient).toHaveBeenCalled()
    expect(analytics.insert).toHaveBeenCalledWith({
      org_id: orgId,
      user_id: userId,
      course_id: courseId,
      module_id: null,
      event_type: 'module_complete',
      metadata: {
        allowedString: 'yes',
        allowedNumber: 7,
        allowedBoolean: true,
      },
    })
  })

  it('SEC-RPT api: returns 403 when RLS rejects course enrollment', async () => {
    const profile = profileQuery({ uid: userId, org_id: orgId })
    const analytics = analyticsInsertQuery({ message: 'new row violates row-level security policy' })
    mocks.serverClient.from.mockImplementation((table: string) => {
      if (table === 'profiles') return profile
      if (table === 'analytics_events') return analytics
      throw new Error(`Unexpected table ${table}`)
    })

    const response = await postAnalyticsEvent(
      jsonRequest('POST', { eventType: 'module_view', courseId })
    )

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({
      error: 'new row violates row-level security policy',
    })
  })
})

describe('GET /api/reports/artifacts', () => {
  it('SEC-RPT api: returns typed report artifacts for the authenticated profile', async () => {
    const artifact: ReportArtifact = {
      id: artifactId,
      report_definition_id: null,
      org_id: orgId,
      generated_by: userId,
      format: 'pdf',
      storage_path: 'reports/test.pdf',
      archive_storage_path: null,
      signed_url: null,
      signed_url_expires: null,
      row_count: 1,
      generation_status: 'complete',
      error_message: null,
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000).toISOString(),
      archived_at: null,
      retention_class: 'ferpa',
    }
    mocks.serverClient.from.mockReturnValue(profileQuery({ uid: userId, role: 'student', org_id: orgId }))
    mocks.getReportArtifactsForUser.mockResolvedValue([artifact])

    const response = await getReportArtifacts()

    expect(response.status).toBe(200)
    expect(await responseJson(response)).toEqual({ artifacts: [artifact], userId })
    expect(getReportArtifactsForUser).toHaveBeenCalledWith(orgId, userId, 'student')
  })
})

describe('DELETE /api/reports/artifacts', () => {
  it('SEC-RPT api: soft-deletes only the caller-owned artifact', async () => {
    mocks.serverClient.from.mockReturnValue(profileQuery({ uid: userId, role: 'student', org_id: orgId }))
    const selectArtifact = selectArtifactQuery({ id: artifactId, org_id: orgId, generated_by: userId })
    const updateArtifact = updateArtifactQuery()
    mocks.serviceClient.from
      .mockReturnValueOnce(selectArtifact)
      .mockReturnValueOnce(updateArtifact)

    const response = await deleteReportArtifact(jsonRequest('DELETE', { artifactId }))

    expect(response.status).toBe(200)
    expect(await responseJson(response)).toEqual({ success: true })
    expect(createServiceRoleClient).toHaveBeenCalledOnce()
    expect(selectArtifact.eq).toHaveBeenCalledWith('org_id', orgId)
    expect(updateArtifact.update).toHaveBeenCalledWith({
      expires_at: expect.any(String),
    })
    expect(updateArtifact.eq).toHaveBeenCalledWith('id', artifactId)
  })

  it('SEC-RPT api: rejects attempts to delete another user artifact', async () => {
    mocks.serverClient.from.mockReturnValue(profileQuery({ uid: userId, role: 'student', org_id: orgId }))
    mocks.serviceClient.from.mockReturnValue(
      selectArtifactQuery({ id: artifactId, org_id: orgId, generated_by: otherUserId })
    )

    const response = await deleteReportArtifact(jsonRequest('DELETE', { artifactId }))

    expect(response.status).toBe(403)
    expect(await responseJson(response)).toEqual({
      error: 'Cannot delete another user report artifact',
    })
  })
})
