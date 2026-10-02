// ChurchCore Connect v1 Types (COUNCIL-2026-038)

export type ChurchCoreRole =
  | 'church_admin'
  | 'pastor'
  | 'ministry_leader'
  | 'secretary'
  | 'member'

export interface ChurchCoreMember {
  id: string
  first_name: string
  last_name: string
  email?: string
  phone?: string
  date_of_birth?: string
  preferred_language?: string
  church_role: ChurchCoreRole
  is_minor?: boolean
  guardian_consent?: boolean
  active?: boolean
}

export interface ChurchCoreFamilyMember {
  person_id: string
  role: 'adult' | 'child'
}

export interface ChurchCoreFamily {
  id: string
  name: string
  members: ChurchCoreFamilyMember[]
}

export interface ChurchCoreGroup {
  id: string
  name: string
  category?: string
  description?: string
  member_ids: string[]
  leader_ids?: string[]
}

export interface ChurchCoreMinistry {
  id: string
  name: string
  member_ids: string[]
  leader_ids?: string[]
}

export interface ChurchCoreOnboardingStep {
  title: string
  order: number
}

export interface ChurchCoreOnboardingTemplate {
  id: string
  name: string
  description?: string
  steps?: ChurchCoreOnboardingStep[]
}

export interface ChurchCoreInboundPayload {
  version: 'churchcore-connect/v1'
  timestamp: string
  type: 'snapshot' | 'delta'
  members?: ChurchCoreMember[]
  families?: ChurchCoreFamily[]
  groups?: ChurchCoreGroup[]
  ministries?: ChurchCoreMinistry[]
  onboarding_templates?: ChurchCoreOnboardingTemplate[]
}

export type OutboundEventType =
  | 'enrollment_created'
  | 'progress_milestone'
  | 'course_completed'
  | 'certificate_issued'
  | 'path_completed'
  | 'attendance_recorded'

export interface OutboundEventPayload {
  event_type: OutboundEventType
  church_ref: string
  timestamp: string
  data: {
    person_external_id: string
    course_id?: string
    course_title?: string
    path_id?: string
    path_title?: string
    milestone_pct?: number
    completed_at?: string
    certificate_number?: string
    certificate_url?: string
    grade_pct?: number // Only shared if explicit org consent enabled
    attendance_date?: string
    status?: string
  }
}

export interface EntityDiffItem {
  id: string
  action: 'create' | 'update' | 'deactivate' | 'link'
  name: string
  details: string
  needs_review: boolean
  warning?: string
  existing_id?: string
}

export interface StagingDiff {
  members: EntityDiffItem[]
  families: EntityDiffItem[]
  groups: EntityDiffItem[]
  ministries: EntityDiffItem[]
  onboarding_templates: EntityDiffItem[]
  summary: {
    total_creates: number
    total_updates: number
    total_deactivates: number
    total_reviews_required: number
    can_auto_apply: boolean
  }
}
