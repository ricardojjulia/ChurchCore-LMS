import type { ChurchCoreRole } from './types'

export type LmsRole = 'admin' | 'manager' | 'teacher' | 'student'

export function mapChurchCoreRoleToLms(role: ChurchCoreRole, isMinor = false): LmsRole {
  if (isMinor) return 'student'

  switch (role) {
    case 'church_admin':
      return 'admin'
    case 'pastor':
      return 'manager'
    case 'ministry_leader':
      return 'teacher'
    case 'secretary':
      return 'manager'
    case 'member':
    default:
      return 'student'
  }
}

export function isPrivilegedRoleChange(targetRole: LmsRole, currentRole?: LmsRole | null): boolean {
  if (targetRole === 'admin' || targetRole === 'manager') {
    // If not already this role, privilege change must be held for review
    return currentRole !== targetRole
  }
  return false
}
