// Reporting audit logger for ADR-2025-012.

import { headers } from 'next/headers'

import type { AuditAction, AuditEntry, ResourceType } from '@/types/reporting'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type AuditLogInsert = {
  org_id: string
  actor_id: string
  actor_role: string
  actor_email: string
  action: AuditAction
  resource_type: ResourceType
  resource_id: string | null
  target_user_id: string | null
  target_course_id: string | null
  request_ip: string | null
  user_agent: string | null
  metadata: Record<string, unknown>
  retention_class: string
}

function firstForwardedIp(value: string | null): string | null {
  if (!value) return null
  const [first] = value.split(',')
  return first?.trim() || null
}

/**
 * Writes an immutable reporting audit event.
 *
 * @security Uses the service-role client because report_audit_log intentionally
 * has no authenticated INSERT policy. The caller must pass an already-authorized
 * application action; this helper only records the audit trail and never grants
 * read or write access to report data.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  const headerStore = await headers()
  const requestIp =
    firstForwardedIp(headerStore.get('x-forwarded-for')) ??
    firstForwardedIp(headerStore.get('x-real-ip'))
  const userAgent = headerStore.get('user-agent')

  const row: AuditLogInsert = {
    org_id: entry.orgId,
    actor_id: entry.actorId,
    actor_role: entry.actorRole,
    actor_email: entry.actorEmail,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    target_user_id: entry.targetUserId,
    target_course_id: entry.targetCourseId,
    request_ip: requestIp,
    user_agent: userAgent,
    metadata: entry.metadata,
    retention_class: entry.retentionClass ?? 'standard',
  }

  const supabase = createServiceRoleClient()
  const { error } = await supabase.from('report_audit_log').insert(row)

  if (error) {
    console.error('[AUDIT_FAILURE]', {
      action: entry.action,
      actorId: entry.actorId,
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
}
