// Reporting aggregate helpers for ADR-2025-012.

import type {
  CourseCompletionRate,
  GradebookSummary,
  StudentReportData,
} from '@/types/reporting'
import { createServerClient } from '@/lib/supabase/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type ProfileRow = {
  uid: string
  display_name: string | null
  email: string | null
}

type EnrollmentRow = {
  course_id: string
  transit_status: string
  progress_percent: number | null
  completed_at: string | null
  courses: {
    id: string
    title: string
    org_id: string
  } | null
}

type CertificateRow = {
  course_id: string
  final_grade: number | null
  letter_grade: string | null
  certificate_no: string | null
}

type BlockSubmissionRow = {
  grade_pct: number | null
  course_blocks: {
    course_id: string
  } | null
}

function assertUUID(value: string, label: string): void {
  if (!UUID_RE.test(value)) {
    throw new Error(`[REPORT_QUERY_ERROR] ${label}: invalid UUID`)
  }
}

function aggregateError(context: string, message: string): Error {
  return new Error(`[REPORT_QUERY_ERROR] ${context}: ${message}`)
}

/**
 * Returns course completion aggregate rows for an organization.
 *
 * @throws Bubbles Postgres errors such as 'Insufficient role' or 'Access denied'.
 */
export async function getCourseCompletionRates(orgId: string): Promise<CourseCompletionRate[]> {
  assertUUID(orgId, 'orgId')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .rpc('get_course_completion_rates', { p_org_id: orgId })
    .returns<CourseCompletionRate[]>()

  if (error) throw aggregateError('getCourseCompletionRates', error.message)
  return (data ?? []) as CourseCompletionRate[]
}

/**
 * Returns gradebook summary rows for a course.
 *
 * @throws Bubbles Postgres errors such as 'Insufficient role' or 'Access denied'.
 */
export async function getGradebookSummary(
  orgId: string,
  courseId: string
): Promise<GradebookSummary[]> {
  assertUUID(orgId, 'orgId')
  assertUUID(courseId, 'courseId')

  const supabase = await createServerClient()
  const { data, error } = await supabase
    .rpc('get_gradebook_summary', { p_org_id: orgId, p_course_id: courseId })
    .returns<GradebookSummary[]>()

  if (error) throw aggregateError('getGradebookSummary', error.message)
  return (data ?? []) as GradebookSummary[]
}

/**
 * Builds the current student's report payload.
 *
 * The `userId` argument is validated against the authenticated session profile,
 * then all LMS data queries use that session-derived profile UID. Do not call
 * this helper from a service-role context; it relies on the server client and
 * RLS to restrict the visible rows to the authenticated student.
 */
export async function buildStudentReportData(
  userId: string,
  orgId: string,
  courseId?: string
): Promise<StudentReportData> {
  assertUUID(userId, 'userId')
  assertUUID(orgId, 'orgId')
  if (courseId) assertUUID(courseId, 'courseId')

  const supabase = await createServerClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw aggregateError('buildStudentReportData', userError.message)
  if (!user) throw aggregateError('buildStudentReportData', 'No authenticated user')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('uid, display_name, email')
    .eq('auth_id', user.id)
    .single<ProfileRow>()

  if (profileError) throw aggregateError('buildStudentReportData', profileError.message)
  if (profile.uid !== userId) {
    throw aggregateError('buildStudentReportData', 'Requested user does not match session user')
  }

  let enrollmentQuery = supabase
    .from('enrollments')
    .select('course_id, transit_status, progress_percent, completed_at, courses!inner(id, title, org_id)')
    .eq('user_id', profile.uid)
    .eq('courses.org_id', orgId)

  if (courseId) {
    enrollmentQuery = enrollmentQuery.eq('course_id', courseId)
  }

  const { data: enrollments, error: enrollmentError } =
    await enrollmentQuery.returns<EnrollmentRow[]>()

  if (enrollmentError) throw aggregateError('buildStudentReportData', enrollmentError.message)

  let certificateQuery = supabase
    .from('course_certificates')
    .select('course_id, final_grade, letter_grade, certificate_no')
    .eq('user_id', profile.uid)

  if (courseId) {
    certificateQuery = certificateQuery.eq('course_id', courseId)
  }

  const { data: certificates, error: certificateError } =
    await certificateQuery.returns<CertificateRow[]>()

  if (certificateError) throw aggregateError('buildStudentReportData', certificateError.message)

  let submissionQuery = supabase
    .from('block_submissions')
    .select('grade_pct, course_blocks!inner(course_id)')
    .eq('user_id', profile.uid)
    .not('grade_pct', 'is', null)

  if (courseId) {
    submissionQuery = submissionQuery.eq('course_blocks.course_id', courseId)
  }

  const { data: submissions, error: submissionError } =
    await submissionQuery.returns<BlockSubmissionRow[]>()

  if (submissionError) throw aggregateError('buildStudentReportData', submissionError.message)

  const certificatesByCourse = new Map(
    (certificates ?? []).map((certificate) => [certificate.course_id, certificate])
  )
  const gradesByCourse = new Map<string, number[]>()

  for (const submission of submissions ?? []) {
    const submissionCourseId = submission.course_blocks?.course_id
    if (!submissionCourseId || submission.grade_pct === null) continue
    const grades = gradesByCourse.get(submissionCourseId) ?? []
    grades.push(submission.grade_pct)
    gradesByCourse.set(submissionCourseId, grades)
  }

  return {
    studentId: profile.uid,
    studentName: profile.display_name ?? '',
    studentEmail: profile.email ?? '',
    orgId,
    generatedAt: new Date().toISOString(),
    courses: (enrollments ?? []).map((enrollment) => {
      const certificate = certificatesByCourse.get(enrollment.course_id)
      const grades = gradesByCourse.get(enrollment.course_id) ?? []
      const averageGrade =
        grades.length > 0
          ? Math.round((grades.reduce((sum, grade) => sum + grade, 0) / grades.length) * 100) / 100
          : certificate?.final_grade ?? null

      return {
        courseId: enrollment.course_id,
        courseTitle: enrollment.courses?.title ?? '',
        enrollmentStatus: enrollment.transit_status,
        progressPercent: enrollment.progress_percent ?? 0,
        averageGrade,
        letterGrade: certificate?.letter_grade ?? null,
        completedAt: enrollment.completed_at,
        certificateNo: certificate?.certificate_no ?? null,
      }
    }),
  }
}
