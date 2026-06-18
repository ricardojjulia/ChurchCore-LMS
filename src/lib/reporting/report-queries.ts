// Reporting query helpers for ADR-2025-012.

import type {
  AnalyticsEvent,
  GenerationStatus,
  ReportArtifact,
  ReportDefinition,
} from '@/types/reporting'
import { createServerClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`[REPORT_QUERY_ERROR] ${label}: invalid UUID`)
  }
}

function reportQueryError(context: string, message: string): Error {
  return new Error(`[REPORT_QUERY_ERROR] ${context}: ${message}`)
}

/**
 * Returns report definitions visible to the current RLS-authenticated user.
 */
export async function getReportDefinitionsForOrg(
  orgId: string,
  userId: string,
  role: string
): Promise<ReportDefinition[]> {
  assertUUID(orgId, 'orgId')
  assertUUID(userId, 'userId')

  const supabase = await createServerClient()
  let query = supabase
    .from('report_definitions')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (role !== 'admin') {
    query = query.eq('created_by', userId)
  }

  const { data, error } = await query.returns<ReportDefinition[]>()
  if (error) throw reportQueryError('getReportDefinitionsForOrg', error.message)
  return data ?? []
}

/**
 * Returns export artifacts visible to the current RLS-authenticated user.
 */
export async function getReportArtifactsForUser(
  orgId: string,
  userId: string,
  role: string
): Promise<ReportArtifact[]> {
  assertUUID(orgId, 'orgId')
  assertUUID(userId, 'userId')

  const supabase = await createServerClient()
  let query = supabase
    .from('report_artifacts')
    .select('*')
    .eq('org_id', orgId)
    .order('generated_at', { ascending: false })

  if (role !== 'admin') {
    query = query.eq('generated_by', userId)
  }

  const { data, error } = await query.returns<ReportArtifact[]>()
  if (error) throw reportQueryError('getReportArtifactsForUser', error.message)
  return data ?? []
}

/**
 * Returns one report artifact if visible through RLS; otherwise null.
 */
export async function getReportArtifactById(artifactId: string): Promise<ReportArtifact | null> {
  assertUUID(artifactId, 'artifactId')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('report_artifacts')
    .select('*')
    .eq('id', artifactId)
    .maybeSingle<ReportArtifact>()

  if (error) throw reportQueryError('getReportArtifactById', error.message)
  return data
}

/**
 * Returns course analytics events visible to the current RLS-authenticated user.
 */
export async function getAnalyticsEventsForCourse(
  orgId: string,
  courseId: string,
  limit = 500
): Promise<AnalyticsEvent[]> {
  assertUUID(orgId, 'orgId')
  assertUUID(courseId, 'courseId')

  const rowLimit = Math.min(Math.max(limit, 1), 1000)
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('analytics_events')
    .select('*')
    .eq('org_id', orgId)
    .eq('course_id', courseId)
    .order('occurred_at', { ascending: false })
    .limit(rowLimit)
    .returns<AnalyticsEvent[]>()

  if (error) throw reportQueryError('getAnalyticsEventsForCourse', error.message)
  return data ?? []
}

/**
 * Creates a report definition under the current RLS-authenticated user.
 */
export async function createReportDefinition(
  data: Omit<ReportDefinition, 'id' | 'created_at' | 'updated_at'>
): Promise<ReportDefinition> {
  assertUUID(data.org_id, 'org_id')
  assertUUID(data.created_by, 'created_by')

  const supabase = await createServerClient()
  const { data: created, error } = await supabase
    .from('report_definitions')
    .insert(data)
    .select('*')
    .single<ReportDefinition>()

  if (error) throw reportQueryError('createReportDefinition', error.message)
  return created
}

/**
 * Creates a report artifact under the current RLS-authenticated user.
 */
export async function createReportArtifact(
  data: Omit<ReportArtifact, 'id' | 'generated_at'>
): Promise<ReportArtifact> {
  assertUUID(data.org_id, 'org_id')
  if (data.report_definition_id) assertUUID(data.report_definition_id, 'report_definition_id')
  if (data.generated_by) assertUUID(data.generated_by, 'generated_by')

  const supabase = await createServerClient()
  const { data: created, error } = await supabase
    .from('report_artifacts')
    .insert(data)
    .select('*')
    .single<ReportArtifact>()

  if (error) throw reportQueryError('createReportArtifact', error.message)
  return created
}

/**
 * Updates artifact generation status and optional metadata.
 */
export async function updateReportArtifactStatus(
  id: string,
  status: GenerationStatus,
  extras: Partial<ReportArtifact> = {}
): Promise<void> {
  assertUUID(id, 'id')

  const { id: _id, generated_at: _generatedAt, ...safeExtras } = extras
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('report_artifacts')
    .update({ ...safeExtras, generation_status: status })
    .eq('id', id)

  if (error) throw reportQueryError('updateReportArtifactStatus', error.message)
}
