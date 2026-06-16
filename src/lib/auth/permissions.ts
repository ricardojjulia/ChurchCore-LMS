export type UserRole = 'student' | 'teacher' | 'admin' | 'manager'

const ADMIN_ROLES = new Set<string>(['admin', 'manager'])
const STAFF_ROLES = new Set<string>(['admin', 'manager', 'teacher'])

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.has(role)
}

export function isStaff(role: string): boolean {
  return STAFF_ROLES.has(role)
}

/** Whether the role can access /admin routes */
export function canAccessAdminRoutes(role: string): boolean {
  return isAdmin(role)
}

/** Whether the role can create/edit courses */
export function canManageCourses(role: string): boolean {
  return isStaff(role)
}

/** Learner-only check */
export function isLearner(role: string): boolean {
  return role === 'student'
}
