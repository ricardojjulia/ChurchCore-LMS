import { describe, it, expect } from 'vitest'
import {
  isAdmin,
  isStaff,
  isLearner,
  canAccessAdminRoutes,
  canManageCourses,
} from './permissions'

describe('isAdmin', () => {
  it('returns true for admin role', () => {
    expect(isAdmin('admin')).toBe(true)
  })

  it('returns true for manager role', () => {
    expect(isAdmin('manager')).toBe(true)
  })

  it('returns false for teacher role', () => {
    expect(isAdmin('teacher')).toBe(false)
  })

  it('returns false for student role', () => {
    expect(isAdmin('student')).toBe(false)
  })
})

describe('isStaff', () => {
  it('returns true for admin role', () => {
    expect(isStaff('admin')).toBe(true)
  })

  it('returns true for teacher role', () => {
    expect(isStaff('teacher')).toBe(true)
  })

  it('returns false for student role', () => {
    expect(isStaff('student')).toBe(false)
  })
})

describe('isLearner', () => {
  it('returns true for student role', () => {
    expect(isLearner('student')).toBe(true)
  })

  it('returns false for admin role', () => {
    expect(isLearner('admin')).toBe(false)
  })

  it('returns false for teacher role', () => {
    expect(isLearner('teacher')).toBe(false)
  })
})

describe('canAccessAdminRoutes', () => {
  it('allows admin to access admin routes', () => {
    expect(canAccessAdminRoutes('admin')).toBe(true)
  })

  it('allows manager to access admin routes', () => {
    expect(canAccessAdminRoutes('manager')).toBe(true)
  })

  it('denies student access to admin routes', () => {
    expect(canAccessAdminRoutes('student')).toBe(false)
  })

  it('denies teacher access to admin routes', () => {
    expect(canAccessAdminRoutes('teacher')).toBe(false)
  })
})

describe('canManageCourses', () => {
  it('allows admin to manage courses', () => {
    expect(canManageCourses('admin')).toBe(true)
  })

  it('allows teacher to manage courses', () => {
    expect(canManageCourses('teacher')).toBe(true)
  })

  it('denies student from managing courses', () => {
    expect(canManageCourses('student')).toBe(false)
  })
})
