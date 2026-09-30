// COUNCIL-2026-034 — Typed scenario context and deterministic fixture setup
// for multi-actor LMS browser verification journeys.
import { COURSE, BLOCK, ORG_A, ORG_B } from './data'
import { USERS, type Role } from './roles'
import { db } from './db'

export interface BrowserScenarioContext {
  orgId: string
  courseId: string
  teacherUid: string
  studentUid: string
  guardianUid?: string
  assignmentBlockId?: string
  submissionId?: string
  evidenceDir: string
}

export function createDefaultScenarioContext(overrides?: Partial<BrowserScenarioContext>): BrowserScenarioContext {
  return {
    orgId: ORG_A,
    courseId: COURSE.a,
    teacherUid: USERS.teacher.uid,
    studentUid: USERS.student.uid,
    guardianUid: USERS.guardian.uid,
    assignmentBlockId: BLOCK.assignment,
    evidenceDir: 'test-results/browser-evidence',
    ...overrides,
  }
}

/**
 * Asserts that the specified database entities exist strictly in targetOrgId
 * and that no rows were created or leaked into cross-tenant organizations.
 */
export async function assertNoCrossTenantLeakage(
  table: string,
  filterColumn: string,
  filterValue: string,
  expectedOrgId: string = ORG_A,
) {
  const supabase = db()
  const { data, error } = await supabase
    .from(table)
    .select('id, org_id')
    .eq(filterColumn, filterValue)

  if (error) {
    throw new Error(`assertNoCrossTenantLeakage failed to query ${table}: ${error.message}`)
  }

  if (data && data.length > 0) {
    for (const row of data) {
      if (row.org_id && row.org_id !== expectedOrgId) {
        throw new Error(
          `Cross-tenant leakage detected in ${table}: row ${row.id} has org_id ${row.org_id}, expected ${expectedOrgId}`,
        )
      }
    }
  }

  // Explicit check against ORG_B
  const { data: crossTenantData } = await supabase
    .from(table)
    .select('id')
    .eq(filterColumn, filterValue)
    .eq('org_id', ORG_B)

  if (crossTenantData && crossTenantData.length > 0) {
    throw new Error(
      `Cross-tenant leakage detected: ${crossTenantData.length} row(s) found in Org B (${ORG_B}) for ${table}`,
    )
  }
}
