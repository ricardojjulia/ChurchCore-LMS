import { redirect } from 'next/navigation'

import { createServerClient } from '@/lib/supabase/server'
import {
  getCourseCompletionRates,
  getGradebookSummary,
} from '@/lib/reporting/report-aggregates'
import CourseCompletionChart from '@/components/reports/charts/CourseCompletionChart'
import GradeDistributionChart from '@/components/reports/charts/GradeDistributionChart'
import GradebookTable from '@/components/reports/tables/GradebookTable'
import TremorProgressBar from '@/components/reports/TremorProgressBar'
import ExportButton from '@/components/reports/ExportButton'
import { generateGradebookPDFExport, generateGradebookXLSXExport } from './actions'

type Profile = {
  org_id: string | null
}

function PermissionError({ message }: { message: string }) {
  return (
    <main className="mx-auto max-w-3xl border border-amber-200 bg-amber-50 p-8">
      <h1 className="text-xl font-bold text-amber-950">Reporting permission required</h1>
      <p className="mt-2 text-sm text-amber-900">{message}</p>
    </main>
  )
}

export default async function InstructorReportsPage({
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
      completionRates.find((course) => course.course_id === requestedCourseId) ?? completionRates[0]

    const gradebook = selectedCourse
      ? await getGradebookSummary(profile.org_id, selectedCourse.course_id)
      : []
    const completionRate = selectedCourse?.completion_rate_pct ?? 0
    const refreshedAt = selectedCourse?.refreshed_at

    return (
      <main className="mx-auto max-w-7xl text-slate-100">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-white">Instructor Gradebook Reports</h1>
            <p className="mt-1 text-sm text-slate-400">
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <form className="flex items-center gap-2" action="/instructor/reports">
              <label htmlFor="course" className="text-sm font-medium text-slate-300">
                Course
              </label>
              <select
                id="course"
                name="course"
                defaultValue={selectedCourse?.course_id}
                className="border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {completionRates.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_title}
                  </option>
                ))}
              </select>
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-sm font-semibold text-white rounded-lg transition-colors">
                Apply
              </button>
            </form>

            <div className="flex gap-2">
              {selectedCourse ? (
                <>
                  <ExportButton
                    label="Export PDF"
                    format="pdf"
                    action={async () => {
                      'use server'
                      return generateGradebookPDFExport(selectedCourse.course_id)
                    }}
                  />
                  <ExportButton
                    label="Export XLSX"
                    format="xlsx"
                    action={async () => {
                      'use server'
                      return generateGradebookXLSXExport(selectedCourse.course_id)
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
        </div>

        <section className="mt-8 card-crisp p-5" aria-labelledby="overall-completion">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="overall-completion" className="text-lg font-display font-semibold text-white">
                Overall Completion
              </h2>
              <p className="text-sm text-slate-400">{selectedCourse?.course_title ?? 'No course selected'}</p>
            </div>
            <p className="text-2xl font-bold text-amber-300">{completionRate}%</p>
          </div>
          <TremorProgressBar value={completionRate} className="mt-4" label="Course completion rate" />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section aria-labelledby="course-completion-chart">
            <h2 id="course-completion-chart" className="text-lg font-display font-semibold text-white">
              Course Completion
            </h2>
            <div className="mt-3 card-crisp p-4">
              <CourseCompletionChart data={completionRates} />
            </div>
          </section>

          <section aria-labelledby="grade-distribution-chart">
            <h2 id="grade-distribution-chart" className="text-lg font-display font-semibold text-white">
              Grade Distribution
            </h2>
            <div className="mt-3 card-crisp p-4">
              <GradeDistributionChart data={gradebook} />
            </div>
          </section>
        </div>

        <section className="mt-8" aria-labelledby="gradebook-table">
          <h2 id="gradebook-table" className="text-lg font-display font-semibold text-white">
            Gradebook
          </h2>
          <div className="mt-3">
            <GradebookTable data={gradebook} courseTitle={selectedCourse?.course_title ?? 'Selected course'} />
          </div>
        </section>
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
