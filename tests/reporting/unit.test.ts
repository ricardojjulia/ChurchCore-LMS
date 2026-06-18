import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  CourseCompletionRate,
  ReportDefinition,
  StudentReportData,
} from '@/types/reporting'
import { writeAuditLog } from '@/lib/reporting/audit-logger'
import { getReportDefinitionsForOrg } from '@/lib/reporting/report-queries'
import {
  buildStudentReportData,
  getCourseCompletionRates,
} from '@/lib/reporting/report-aggregates'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createServerClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

type SupabaseError = { message: string }
type QueryResponse<T> = { data: T | null; error: SupabaseError | null }

type QueryChain = {
  select: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  not: ReturnType<typeof vi.fn>
  insert: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  returns: ReturnType<typeof vi.fn>
}

type ServiceClient = {
  from: ReturnType<typeof vi.fn>
}

type ServerClient = {
  from: ReturnType<typeof vi.fn>
  rpc: ReturnType<typeof vi.fn>
  auth: {
    getUser: ReturnType<typeof vi.fn>
  }
}

const mocks = vi.hoisted(() => ({
  serviceClient: { from: vi.fn() },
  serverClient: {
    from: vi.fn(),
    rpc: vi.fn(),
    auth: { getUser: vi.fn() },
  },
  headerValues: new Map<string, string>(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => mocks.serviceClient),
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(async () => mocks.serverClient),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mocks.headerValues.get(name.toLowerCase()) ?? null,
  })),
}))

function queryChain<T>(response: QueryResponse<T>): QueryChain {
  const chain = {} as QueryChain
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.not = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.single = vi.fn(async () => response)
  chain.maybeSingle = vi.fn(async () => response)
  chain.returns = vi.fn(async () => response)
  return chain
}

function rpcChain<T>(response: QueryResponse<T>) {
  return {
    returns: vi.fn(async () => response),
  }
}

const orgId = '10000000-0000-4000-8000-000000000001'
const userId = '30000000-0000-4000-8000-000000000001'
const authId = '20000000-0000-4000-8000-000000000001'
const courseId = '40000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.headerValues.clear()
})

describe('writeAuditLog', () => {
  it('SEC-RPT audit: inserts a correctly shaped audit row', async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }))
    mocks.serviceClient.from.mockReturnValue({ insert })
    mocks.headerValues.set('x-forwarded-for', '203.0.113.1')
    mocks.headerValues.set('user-agent', 'vitest-agent')

    await expect(
      writeAuditLog({
        orgId,
        actorId: userId,
        actorRole: 'student',
        actorEmail: 'student@example.test',
        action: 'report_viewed',
        resourceType: 'analytics_dashboard',
        resourceId: null,
        targetUserId: userId,
        targetCourseId: courseId,
        metadata: { source: 'unit-test' },
      })
    ).resolves.toBeUndefined()

    expect(createServiceRoleClient).toHaveBeenCalledOnce()
    expect(mocks.serviceClient.from).toHaveBeenCalledWith('report_audit_log')
    expect(insert).toHaveBeenCalledWith({
      org_id: orgId,
      actor_id: userId,
      actor_role: 'student',
      actor_email: 'student@example.test',
      action: 'report_viewed',
      resource_type: 'analytics_dashboard',
      resource_id: null,
      target_user_id: userId,
      target_course_id: courseId,
      request_ip: '203.0.113.1',
      user_agent: 'vitest-agent',
      metadata: { source: 'unit-test' },
      retention_class: 'standard',
    })
  })

  it('SEC-RPT audit: logs failures without throwing', async () => {
    const insert = vi.fn(async () => ({ data: null, error: { message: 'write denied' } }))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.serviceClient.from.mockReturnValue({ insert })

    await expect(
      writeAuditLog({
        orgId,
        actorId: userId,
        actorRole: 'student',
        actorEmail: 'student@example.test',
        action: 'report_viewed',
        resourceType: 'analytics_dashboard',
        resourceId: null,
        targetUserId: null,
        targetCourseId: null,
        metadata: {},
      })
    ).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith(
      '[AUDIT_FAILURE]',
      expect.objectContaining({
        action: 'report_viewed',
        actorId: userId,
        error: 'write denied',
      })
    )
  })

  it('SEC-RPT audit: uses the first x-forwarded-for IP', async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }))
    mocks.serviceClient.from.mockReturnValue({ insert })
    mocks.headerValues.set('x-forwarded-for', '203.0.113.10, 198.51.100.4')

    await writeAuditLog({
      orgId,
      actorId: userId,
      actorRole: 'student',
      actorEmail: 'student@example.test',
      action: 'report_viewed',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: null,
      metadata: {},
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_ip: '203.0.113.10' }))
  })

  it('SEC-RPT audit: falls back to x-real-ip', async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }))
    mocks.serviceClient.from.mockReturnValue({ insert })
    mocks.headerValues.set('x-real-ip', '198.51.100.8')

    await writeAuditLog({
      orgId,
      actorId: userId,
      actorRole: 'student',
      actorEmail: 'student@example.test',
      action: 'report_viewed',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: null,
      metadata: {},
    })

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_ip: '198.51.100.8' }))
  })

  it('SEC-RPT audit: stores null request IP when no IP headers exist', async () => {
    const insert = vi.fn(async () => ({ data: null, error: null }))
    mocks.serviceClient.from.mockReturnValue({ insert })

    await writeAuditLog({
      orgId,
      actorId: userId,
      actorRole: 'student',
      actorEmail: 'student@example.test',
      action: 'report_viewed',
      resourceType: 'analytics_dashboard',
      resourceId: null,
      targetUserId: null,
      targetCourseId: null,
      metadata: {},
    })

    expect(headers).toHaveBeenCalledOnce()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_ip: null }))
  })
})

describe('getReportDefinitionsForOrg', () => {
  it('returns typed report definitions on success', async () => {
    const rows: ReportDefinition[] = [
      {
        id: '50000000-0000-4000-8000-000000000001',
        org_id: orgId,
        created_by: userId,
        name: 'Student Progress',
        report_type: 'completion',
        config: {},
        is_scheduled: false,
        schedule_cron: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    const chain = queryChain<ReportDefinition[]>({ data: rows, error: null })
    mocks.serverClient.from.mockReturnValue(chain)

    await expect(getReportDefinitionsForOrg(orgId, userId, 'teacher')).resolves.toEqual(rows)

    expect(createServerClient).toHaveBeenCalledOnce()
    expect(mocks.serverClient.from).toHaveBeenCalledWith('report_definitions')
    expect(chain.eq).toHaveBeenCalledWith('org_id', orgId)
    expect(chain.eq).toHaveBeenCalledWith('created_by', userId)
  })

  it('throws with REPORT_QUERY_ERROR on Supabase errors', async () => {
    const chain = queryChain<ReportDefinition[]>({
      data: null,
      error: { message: 'permission denied' },
    })
    mocks.serverClient.from.mockReturnValue(chain)

    await expect(getReportDefinitionsForOrg(orgId, userId, 'admin')).rejects.toThrow(
      '[REPORT_QUERY_ERROR] getReportDefinitionsForOrg: permission denied'
    )
  })

  it('throws validation errors before hitting Supabase for invalid UUIDs', async () => {
    await expect(getReportDefinitionsForOrg('not-a-uuid', userId, 'admin')).rejects.toThrow(
      '[REPORT_QUERY_ERROR] orgId: invalid UUID'
    )

    expect(mocks.serverClient.from).not.toHaveBeenCalled()
  })
})

describe('getCourseCompletionRates', () => {
  it('calls the completion RPC with correct params and returns rows', async () => {
    const rows: CourseCompletionRate[] = [
      {
        org_id: orgId,
        course_id: courseId,
        course_title: 'Foundations',
        enrolled_count: 10,
        completed_count: 7,
        completion_rate_pct: 70,
        refreshed_at: '2026-01-01T00:00:00.000Z',
      },
    ]
    mocks.serverClient.rpc.mockReturnValue(rpcChain<CourseCompletionRate[]>({ data: rows, error: null }))

    await expect(getCourseCompletionRates(orgId)).resolves.toEqual(rows)

    expect(mocks.serverClient.rpc).toHaveBeenCalledWith('get_course_completion_rates', {
      p_org_id: orgId,
    })
  })

  it('propagates Insufficient role RPC errors', async () => {
    mocks.serverClient.rpc.mockReturnValue(
      rpcChain<CourseCompletionRate[]>({ data: null, error: { message: 'Insufficient role' } })
    )

    await expect(getCourseCompletionRates(orgId)).rejects.toThrow(
      '[REPORT_QUERY_ERROR] getCourseCompletionRates: Insufficient role'
    )
  })

  it('propagates Access denied RPC errors', async () => {
    mocks.serverClient.rpc.mockReturnValue(
      rpcChain<CourseCompletionRate[]>({ data: null, error: { message: 'Access denied' } })
    )

    await expect(getCourseCompletionRates(orgId)).rejects.toThrow(
      '[REPORT_QUERY_ERROR] getCourseCompletionRates: Access denied'
    )
  })
})

describe('buildStudentReportData', () => {
  it('uses the authenticated session profile and returns student report data', async () => {
    const profileChain = queryChain({
      data: { uid: userId, display_name: 'Student A', email: 'student@example.test' },
      error: null,
    })
    const enrollmentChain = queryChain({
      data: [
        {
          course_id: courseId,
          transit_status: 'in_progress',
          progress_percent: 80,
          completed_at: null,
          courses: { id: courseId, title: 'Foundations', org_id: orgId },
        },
      ],
      error: null,
    })
    const certificateChain = queryChain({
      data: [
        {
          course_id: courseId,
          final_grade: 91,
          letter_grade: 'A-',
          certificate_no: 'CERT-001',
        },
      ],
      error: null,
    })
    const submissionChain = queryChain({
      data: [
        { grade_pct: 90, course_blocks: { course_id: courseId } },
        { grade_pct: 94, course_blocks: { course_id: courseId } },
      ],
      error: null,
    })

    mocks.serverClient.auth.getUser.mockResolvedValue({
      data: { user: { id: authId } },
      error: null,
    })
    mocks.serverClient.from
      .mockReturnValueOnce(profileChain)
      .mockReturnValueOnce(enrollmentChain)
      .mockReturnValueOnce(certificateChain)
      .mockReturnValueOnce(submissionChain)

    const result = await buildStudentReportData(userId, orgId, courseId)

    const expected: StudentReportData = {
      studentId: userId,
      studentName: 'Student A',
      studentEmail: 'student@example.test',
      orgId,
      generatedAt: result.generatedAt,
      courses: [
        {
          courseId,
          courseTitle: 'Foundations',
          enrollmentStatus: 'in_progress',
          progressPercent: 80,
          averageGrade: 92,
          letterGrade: 'A-',
          completedAt: null,
          certificateNo: 'CERT-001',
        },
      ],
    }

    expect(result).toEqual(expected)
    expect(profileChain.eq).toHaveBeenCalledWith('auth_id', authId)
    expect(enrollmentChain.eq).toHaveBeenCalledWith('user_id', userId)
    expect(certificateChain.eq).toHaveBeenCalledWith('user_id', userId)
    expect(submissionChain.eq).toHaveBeenCalledWith('user_id', userId)
  })
})
