import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChurchCoreInboundPayload } from './types'
import { mapChurchCoreRoleToLms } from './roles'

export interface ApplyResult {
  success: boolean
  appliedCounts: {
    profilesCreated: number
    profilesUpdated: number
    profilesDeactivated: number
    cohortsSynced: number
    guardianLinksCreated: number
  }
  error?: string
}

export async function applyChurchCoreDelivery(
  supabase: SupabaseClient,
  {
    deliveryId,
    orgId,
    connectionId,
    adminUid,
    payload,
  }: {
    deliveryId: string
    orgId: string
    connectionId: string
    adminUid: string
    payload: ChurchCoreInboundPayload
  }
): Promise<ApplyResult> {
  const counts = {
    profilesCreated: 0,
    profilesUpdated: 0,
    profilesDeactivated: 0,
    cohortsSynced: 0,
    guardianLinksCreated: 0,
  }

  try {
    const personToUidMap = new Map<string, string>()

    // 1. Process members
    if (payload.members) {
      for (const member of payload.members) {
        const targetRole = mapChurchCoreRoleToLms(member.church_role, member.is_minor)

        // Check if already linked via external_entity_links
        const { data: existingLink } = await supabase
          .from('external_entity_links')
          .select('internal_id')
          .eq('org_id', orgId)
          .eq('source_system', 'churchcore')
          .eq('external_id', member.id)
          .maybeSingle()

        if (member.active === false) {
          if (existingLink?.internal_id) {
            // Deactivate profile
            await supabase
              .from('profiles')
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq('uid', existingLink.internal_id)
              .eq('org_id', orgId)
            counts.profilesDeactivated++
          }
          continue
        }

        let targetUid = existingLink?.internal_id

        if (!targetUid && member.email) {
          // Check existing unlinked profile by email
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('uid')
            .eq('org_id', orgId)
            .ilike('email', member.email)
            .maybeSingle()

          if (existingProfile?.uid) {
            targetUid = existingProfile.uid
          }
        }

        if (targetUid) {
          // Update profile
          await supabase
            .from('profiles')
            .update({
              first_name: member.first_name,
              last_name: member.last_name,
              full_name: `${member.first_name} ${member.last_name}`,
              phone: member.phone || null,
              is_active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('uid', targetUid)
            .eq('org_id', orgId)

          // Update role if changed
          await supabase
            .from('profile_roles')
            .upsert({
              profile_id: targetUid,
              role: targetRole,
              org_id: orgId,
            }, { onConflict: 'profile_id,role,org_id' })

          counts.profilesUpdated++
        } else {
          // Create placeholder profile for claim via ChurchCore SSO
          const { data: newProfile, error: createErr } = await supabase
            .from('profiles')
            .insert({
              org_id: orgId,
              first_name: member.first_name,
              last_name: member.last_name,
              full_name: `${member.first_name} ${member.last_name}`,
              email: member.email || `cc_${member.id}@unclaimed.churchcore.local`,
              phone: member.phone || null,
              is_active: true,
            })
            .select('uid')
            .single()

          if (createErr || !newProfile) {
            console.error('Failed to create profile for ChurchCore member:', member.id, createErr)
            continue
          }

          targetUid = newProfile.uid

          await supabase.from('profile_roles').insert({
            profile_id: targetUid,
            role: targetRole,
            org_id: orgId,
          })

          counts.profilesCreated++
        }

        personToUidMap.set(member.id, targetUid)

        // Ensure external entity link exists
        await supabase
          .from('external_entity_links')
          .upsert({
            org_id: orgId,
            source_system: 'churchcore',
            churchcore_connection_id: connectionId,
            external_id: member.id,
            object_type: 'person',
            internal_id: targetUid,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'org_id,source_system,external_id' })
      }
    }

    // 2. Process groups & ministries into cohorts
    const allGroups = [
      ...(payload.groups || []).map(g => ({ ...g, type: 'group' })),
      ...(payload.ministries || []).map(m => ({ ...m, type: 'ministry' })),
    ]

    for (const group of allGroups) {
      // Find or create cohort
      const { data: existingCohortLink } = await supabase
        .from('external_entity_links')
        .select('internal_id')
        .eq('org_id', orgId)
        .eq('source_system', 'churchcore')
        .eq('external_id', group.id)
        .maybeSingle()

      let cohortId = existingCohortLink?.internal_id

      if (cohortId) {
        await supabase
          .from('cohorts')
          .update({
            name: group.name,
            description: (group as any).description || `Synced ChurchCore ${group.type}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', cohortId)
          .eq('org_id', orgId)
      } else {
        const { data: newCohort } = await supabase
          .from('cohorts')
          .insert({
            org_id: orgId,
            name: group.name,
            description: (group as any).description || `Synced ChurchCore ${group.type}`,
          })
          .select('id')
          .single()

        if (newCohort) {
          cohortId = newCohort.id
          await supabase.from('external_entity_links').insert({
            org_id: orgId,
            source_system: 'churchcore',
            churchcore_connection_id: connectionId,
            external_id: group.id,
            object_type: 'group',
            internal_id: cohortId,
          })
        }
      }

      if (cohortId) {
        counts.cohortsSynced++
        // Sync cohort members
        for (const memberId of group.member_ids) {
          const profileUid = personToUidMap.get(memberId)
          if (profileUid) {
            await supabase
              .from('cohort_members')
              .upsert({
                cohort_id: cohortId,
                user_id: profileUid,
                org_id: orgId,
              }, { onConflict: 'cohort_id,user_id' })
          }
        }
      }
    }

    // 3. Mark delivery as applied
    await supabase
      .from('churchcore_deliveries')
      .update({
        status: 'applied',
        applied_at: new Date().toISOString(),
        applied_by: adminUid,
        stats: counts,
      })
      .eq('id', deliveryId)
      .eq('org_id', orgId)

    return {
      success: true,
      appliedCounts: counts,
    }
  } catch (err: any) {
    console.error('Error applying ChurchCore delivery:', err)
    return {
      success: false,
      appliedCounts: counts,
      error: err?.message || 'Failed to apply delivery',
    }
  }
}
