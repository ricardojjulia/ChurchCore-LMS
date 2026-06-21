import { redirect } from 'next/navigation'

import { createServerClient } from '@/lib/supabase/server'
import { getCourseCompletionRates, getGradebookSummary } from '@/lib/reporting/report-aggregates'
import CourseCompletionChart from '@/components/reports/charts/CourseCompletionChart'
import GradeDistributionChart from '@/components/reports/charts/GradeDistributionChart'
import GradebookTable from '@/components/reports/tables/GradebookTable'
import TremorProgressBar from '@/components/reports/TremorProgressBar'

type Profile = { org_id: string | null }

function PermissionError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl border border-amber-200 bg-amber-50 p-8">
      <h1 className="text-xl font-bold text-amber-950">Reporting permission required</h1>
      <p className="mt-2 text-sm text-amber-900">{message}</p>
    </main>
  )
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>
}) {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (!profile?.org_id) redirect('/onboarding')

  const { course: requestedCourseId } = await searchParams

  try {
    const completionRates = await getCourseCompletionRates(profile.org_id)
    const selectedCourse =
      completionRates.find((c) => c.course_id === requestedCourseId) ?? completionRates[0]

    const gradebook = selectedCourse
      ? await getGradebookSummary(profile.org_id, selectedCourse.course_id)
      : []

    const completionRate = selectedCourse?.completion_rate_pct ?? 0
    const refreshedAt = selectedCourse?.refreshed_at

    const totalEnrolled = completionRates.reduce((sum, c) => sum + (c.enrolled_count ?? 0), 0)
    const totalCompleted = completionRates.reduce((sum, c) => sum + (c.completed_count ?? 0), 0)
    const overallRate =
      totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0

    return (
      <main className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Admin Reporting Overview</h1>
            <p className="mt-1 text-sm text-slate-600">
              Data as of{' '}
              {refreshedAt
                ? new Date(refreshedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })
                : 'not yet refreshed'}{' '}
              — refreshes hourly
            </p>
          </div>

          {completionRates.length > 0 && (
            <form className="flex items-center gap-2" action="/admin/reports">
              <label htmlFor="course" className="text-sm font-medium text-slate-700">
                Course
              </label>
              <select
                id="course"
                name="course"
                defaultValue={selectedCourse?.course_id}
                className="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {completionRates.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.course_title}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="bg-slate-950 px-3 py-2 text-sm font-semibold text-white"
              >
                Apply
              </button>
            </form>
          )}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Courses</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{completionRates.length}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Total Enrolled</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{totalEnrolled}</p>
          </div>
          <div className="border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Org-wide Completion</p>
            <p className="mt-1 text-3xl font-bold text-slate-950">{overallRate}%</p>
          </div>
        </div>

        {selectedCourse && (
          <section
            className="mt-8 border border-slate-200 bg-white p-5 shadow-sm"
            aria-labelledby="selected-completion"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 id="selected-completion" className="text-lg font-semibold text-slate-950">
                  Selected Course Completion
                </h2>
                <p className="text-sm text-slate-600">{selectedCourse.course_title}</p>
              </div>
              <p className="text-2xl font-bold text-slate-950">{completionRate}%</p>
            </div>
            <TremorProgressBar value={completionRate} className="mt-4" />
          </section>
        )}

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section aria-labelledby="course-completion-chart">
            <h2 id="course-completion-chart" className="text-lg font-semibold text-slate-950">
              Course Completion — All Courses
            </h2>
            <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
              <CourseCompletionChart data={completionRates} />
            </div>
          </section>

          <section aria-labelledby="grade-distribution-chart">
            <h2 id="grade-distribution-chart" className="text-lg font-semibold text-slate-950">
              Grade Distribution
            </h2>
            <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
              <GradeDistributionChart data={gradebook} />
            </div>
          </section>
        </div>

        {gradebook.length > 0 && (
          <section className="mt-8" aria-labelledby="gradebook-table">
            <h2 id="gradebook-table" className="text-lg font-semibold text-slate-950">
              Gradebook — {selectedCourse?.course_title}
            </h2>
            <div className="mt-3">
              <GradebookTable
                data={gradebook}
                courseTitle={selectedCourse?.course_title ?? 'Selected course'}
              />
            </div>
          </section>
        )}

        {completionRates.length === 0 && (
          <div className="mt-12 border border-slate-200 bg-white p-10 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">No report data yet</h2>
            <p className="mt-2 text-sm text-slate-600">
              Enroll students in courses and wait for the hourly view refresh, or run{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">
                SELECT refresh_report_materialized_views()
              </code>{' '}
              in the Supabase SQL editor to populate reports immediately.
            </p>
          </div>
        )}
      </main>
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load reporting data'
    if (message.includes('Insufficient role') || message.includes('Access denied')) {
      return <PermissionError message={message} />
    }
    throw error
  }
}
