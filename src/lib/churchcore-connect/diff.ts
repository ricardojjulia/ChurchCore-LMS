import type { ChurchCoreInboundPayload, EntityDiffItem, StagingDiff } from './types'
import { mapChurchCoreRoleToLms, isPrivilegedRoleChange, type LmsRole } from './roles'

interface ExistingLmsContext {
  profilesByExternalId: Map<string, { uid: string; email?: string; role: LmsRole; full_name?: string }>
  profilesByEmail: Map<string, { uid: string; email?: string; role: LmsRole; full_name?: string }>
  existingCohortExternalIds: Set<string>
}

const DEACTIVATION_THRESHOLD = 5

export function computeStagingDiff(
  payload: ChurchCoreInboundPayload,
  context: ExistingLmsContext
): StagingDiff {
  const memberDiffs: EntityDiffItem[] = []
  const familyDiffs: EntityDiffItem[] = []
  const groupDiffs: EntityDiffItem[] = []
  const ministryDiffs: EntityDiffItem[] = []
  const templateDiffs: EntityDiffItem[] = []

  let totalCreates = 0
  let totalUpdates = 0
  let totalDeactivates = 0
  let totalReviewsRequired = 0

  // 1. Process members
  if (payload.members) {
    for (const member of payload.members) {
      const targetRole = mapChurchCoreRoleToLms(member.church_role, member.is_minor)
      const existingByExt = context.profilesByExternalId.get(member.id)
      const existingByEmail = member.email ? context.profilesByEmail.get(member.email.toLowerCase()) : undefined

      const fullName = `${member.first_name} ${member.last_name}`

      if (member.active === false) {
        // Deactivation
        if (existingByExt) {
          totalDeactivates++
          memberDiffs.push({
            id: member.id,
            action: 'deactivate',
            name: fullName,
            details: `Deactivate LMS access for ${fullName} (${existingByExt.role})`,
            needs_review: true, // Always review deactivations
            warning: 'Account will be deactivated in LMS',
            existing_id: existingByExt.uid,
          })
          totalReviewsRequired++
        }
        continue
      }

      if (existingByExt) {
        // Update existing linked user
        const roleElevation = isPrivilegedRoleChange(targetRole, existingByExt.role)
        if (roleElevation) {
          totalReviewsRequired++
        }
        totalUpdates++

        memberDiffs.push({
          id: member.id,
          action: 'update',
          name: fullName,
          details: `Update profile (${existingByExt.role} → ${targetRole})`,
          needs_review: roleElevation,
          warning: roleElevation ? `Privilege change to "${targetRole}" requires admin review` : undefined,
          existing_id: existingByExt.uid,
        })
      } else if (existingByEmail) {
        // Match existing unlinked user by email
        totalReviewsRequired++
        memberDiffs.push({
          id: member.id,
          action: 'link',
          name: fullName,
          details: `Link existing LMS account (${existingByEmail.email}) to ChurchCore ID ${member.id}`,
          needs_review: true,
          warning: `Matches existing LMS account (${existingByEmail.full_name || existingByEmail.email})`,
          existing_id: existingByEmail.uid,
        })
      } else {
        // New account creation
        const isPrivileged = targetRole === 'admin' || targetRole === 'manager'
        if (isPrivileged) {
          totalReviewsRequired++
        }
        totalCreates++

        memberDiffs.push({
          id: member.id,
          action: 'create',
          name: fullName,
          details: `Create new ${targetRole} account for ${fullName}`,
          needs_review: isPrivileged,
          warning: isPrivileged ? `Initial admin/manager account requires review` : undefined,
        })
      }
    }
  }

  // 2. Process families (guardian links)
  if (payload.families) {
    for (const fam of payload.families) {
      familyDiffs.push({
        id: fam.id,
        action: 'create',
        name: fam.name,
        details: `Sync household with ${fam.members.length} member(s)`,
        needs_review: false,
      })
    }
  }

  // 3. Process groups & ministries (cohorts)
  if (payload.groups) {
    for (const g of payload.groups) {
      const exists = context.existingCohortExternalIds.has(g.id)
      groupDiffs.push({
        id: g.id,
        action: exists ? 'update' : 'create',
        name: g.name,
        details: `${exists ? 'Update' : 'Create'} cohort with ${g.member_ids.length} member(s)`,
        needs_review: false,
      })
    }
  }

  if (payload.ministries) {
    for (const m of payload.ministries) {
      const exists = context.existingCohortExternalIds.has(m.id)
      ministryDiffs.push({
        id: m.id,
        action: exists ? 'update' : 'create',
        name: m.name,
        details: `${exists ? 'Update' : 'Create'} ministry cohort with ${m.member_ids.length} member(s)`,
        needs_review: false,
      })
    }
  }

  // 4. Process onboarding templates
  if (payload.onboarding_templates) {
    for (const t of payload.onboarding_templates) {
      templateDiffs.push({
        id: t.id,
        action: 'create',
        name: t.name,
        details: `Candidate learning path / auto-enrollment track (${t.steps?.length || 0} steps)`,
        needs_review: false,
      })
    }
  }

  const canAutoApply =
    totalReviewsRequired === 0 &&
    totalDeactivates < DEACTIVATION_THRESHOLD

  return {
    members: memberDiffs,
    families: familyDiffs,
    groups: groupDiffs,
    ministries: ministryDiffs,
    onboarding_templates: templateDiffs,
    summary: {
      total_creates: totalCreates,
      total_updates: totalUpdates,
      total_deactivates: totalDeactivates,
      total_reviews_required: totalReviewsRequired,
      can_auto_apply: canAutoApply,
    },
  }
}
