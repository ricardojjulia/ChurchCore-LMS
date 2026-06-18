import { Suspense } from 'react'
import { redirect } from 'next/navigation'

import { createServerClient } from '@/lib/supabase/server'
import {
  buildStudentReportData,
  getCourseCompletionRates,
} from '@/lib/reporting/report-aggregates'
import ModuleCompletionChart from '@/components/reports/charts/ModuleCompletionChart'
import GradeHistoryChart from '@/components/reports/charts/GradeHistoryChart'
import EnrollmentTable from '@/components/reports/tables/EnrollmentTable'
import StudentProgressSkeleton from '@/components/reports/StudentProgressSkeleton'
import { generateStudentProgressReport } from './actions'

type Profile = {
  uid: string
  org_id: string | null
}

function EmptyState() {
  return (
    <div className="mt-8 border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">No report data yet</h2>
      <p className="mt-2 text-sm text-slate-600">
        Enroll in a course or complete your first activity to populate progress reports.
      </p>
    </div>
  )
}

export default async function StudentReportsPage() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, org_id')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (!profile?.org_id) redirect('/onboarding')

  const [reportData, completionRates] = await Promise.all([
    buildStudentReportData(profile.uid, profile.org_id),
    getCourseCompletionRates(profile.org_id).catch(() => []),
  ])

  const latestRefresh = completionRates
    .map((rate) => rate.refreshed_at)
    .sort()
    .at(-1)

  const moduleCompletionData = reportData.courses.map((course) => ({
    date: course.completedAt ?? reportData.generatedAt,
    completed: Math.round(course.progressPercent),
    total: 100,
  }))

  const gradeHistoryData = reportData.courses.map((course) => ({
    assignment: course.courseTitle,
    grade: course.averageGrade,
    submittedAt: course.completedAt ?? reportData.generatedAt,
  }))

  return (
    <main className="mx-auto max-w-6xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">My Progress Reports</h1>
          <p className="mt-1 text-sm text-slate-600">
            Last updated{' '}
            {new Date(latestRefresh ?? reportData.generatedAt).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </p>
        </div>
        <form action={generateStudentProgressReport}>
          <button
            type="submit"
            className="inline-flex items-center justify-center bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Download My Progress Report
          </button>
        </form>
      </div>

      <noscript>
        <p className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          JavaScript is disabled. Use the table view below for your accessible progress report.
        </p>
      </noscript>

      {reportData.courses.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          <Suspense fallback={<StudentProgressSkeleton variant="chart" />}>
            <section aria-labelledby="module-completion-heading">
              <h2 id="module-completion-heading" className="text-lg font-semibold text-slate-950">
                Module Completion
              </h2>
              <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
                <ModuleCompletionChart data={moduleCompletionData} />
              </div>
            </section>
          </Suspense>

          <Suspense fallback={<StudentProgressSkeleton variant="chart" />}>
            <section aria-labelledby="grade-history-heading">
              <h2 id="grade-history-heading" className="text-lg font-semibold text-slate-950">
                Grade History
              </h2>
              <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
                <GradeHistoryChart data={gradeHistoryData} />
              </div>
            </section>
          </Suspense>

          <Suspense fallback={<StudentProgressSkeleton variant="table" />}>
            <section aria-labelledby="enrollment-table-heading">
              <h2 id="enrollment-table-heading" className="text-lg font-semibold text-slate-950">
                Course Enrollments
              </h2>
              <div className="mt-3">
                <EnrollmentTable courses={reportData.courses} />
              </div>
            </section>
          </Suspense>
        </div>
      )}
    </main>
  )
}
