import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export type UserRole   = 'admin' | 'manager' | 'teacher' | 'student'
export type UserStatus = 'active' | 'suspended' | 'pending' | 'archived'
export type TransitStatus = 'not_started' | 'in_progress' | 'completed' | 'dropped' | 'paused'

export interface EnrolledCourse {
  enrollmentId:   string
  courseId:       string
  title:          string
  description:    string | null
  isPublished:    boolean
  transitStatus:  TransitStatus
  progressPercent: number
  lastAccessedAt: string | null
  completedAt:    string | null
}

export interface OwnedCourse {
  id:          string
  title:       string
  description: string | null
  isPublished: boolean
  createdAt:   string
}

export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night'

export function getTimeOfDay(): TimeOfDay {
  const h = new Date().getUTCHours()
  if (h >= 5  && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}

export interface DashboardContext {
  uid:            string
  authId:         string
  displayName:    string
  email:          string
  role:           UserRole
  status:         UserStatus
  xpPoints:       number
  currentLevel:   number
  isStaff:        boolean
  isAdmin:        boolean
  enrollments:    EnrolledCourse[]
  ownedCourses:   OwnedCourse[]
  unreadCount:    number
  timeOfDay:      TimeOfDay
  // Admin-only stats
  stats?: {
    totalUsers:   number
    totalStudents: number
    totalTeachers: number
    totalCourses:  number
  }
}

export async function resolveUserDashboardContext(): Promise<DashboardContext> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Single profile query — role comes from DB, never from client
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('uid, auth_id, display_name, email, role, status, xp_points, current_level')
    .eq('auth_id', user.id)
    .single()

  if (profileErr || !profile) redirect('/login')

  const role    = profile.role as UserRole
  const isStaff = role === 'admin' || role === 'manager' || role === 'teacher'
  const isAdmin = role === 'admin'

  // Parallel fetches
  const [enrollResult, ownedResult, unreadResult, statsResult] = await Promise.all([
    // Enrolled courses with transit state
    supabase
      .from('enrollments')
      .select(`
        id,
        course_id,
        transit_status,
        progress_percent,
        last_accessed_at,
        completed_at,
        courses (
          id,
          title,
          description,
          is_published
        )
      `)
      .eq('user_id', profile.uid)
      .order('last_accessed_at', { ascending: false, nullsFirst: false }),

    // Courses this user owns/teaches (staff only)
    isStaff
      ? supabase
          .from('courses')
          .select('id, title, description, is_published, created_at')
          .eq('owner_id', profile.uid)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as OwnedCourse[], error: null }),

    // Unread notification count
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.uid)
      .eq('is_read', false)
      .eq('is_dismissed', false),

    // Admin stats
    isAdmin
      ? supabase.from('profiles').select('role', { count: 'exact' })
      : Promise.resolve({ data: null, error: null, count: null }),
  ])

  const enrollments: EnrolledCourse[] = (enrollResult.data ?? []).map((e: any) => ({
    enrollmentId:    e.id,
    courseId:        e.course_id,
    title:           e.courses?.title ?? 'Course',
    description:     e.courses?.description ?? null,
    isPublished:     e.courses?.is_published ?? false,
    transitStatus:   (e.transit_status ?? 'not_started') as TransitStatus,
    progressPercent: Number(e.progress_percent ?? 0),
    lastAccessedAt:  e.last_accessed_at ?? null,
    completedAt:     e.completed_at ?? null,
  }))

  const ownedCourses: OwnedCourse[] = (ownedResult.data ?? []).map((c: any) => ({
    id:          c.id,
    title:       c.title,
    description: c.description ?? null,
    isPublished: c.is_published ?? false,
    createdAt:   c.created_at,
  }))

  let stats: DashboardContext['stats']
  if (isAdmin && statsResult.data) {
    const rows = statsResult.data as { role: string }[]
    stats = {
      totalUsers:    statsResult.count ?? rows.length,
      totalStudents: rows.filter((r) => r.role === 'student').length,
      totalTeachers: rows.filter((r) => r.role === 'teacher').length,
      totalCourses:  0, // filled below
    }
    const { count: courseCount } = await supabase
      .from('courses')
      .select('id', { count: 'exact', head: true })
    if (stats) stats.totalCourses = courseCount ?? 0
  }

  return {
    uid:          profile.uid,
    authId:       profile.auth_id,
    displayName:  profile.display_name ?? user.email?.split('@')[0] ?? 'User',
    email:        profile.email ?? user.email ?? '',
    role,
    status:       profile.status as UserStatus,
    xpPoints:     profile.xp_points ?? 0,
    currentLevel: profile.current_level ?? 1,
    isStaff,
    isAdmin,
    enrollments,
    ownedCourses,
    unreadCount:  unreadResult.count ?? 0,
    timeOfDay:    getTimeOfDay(),
    stats,
  }
}
