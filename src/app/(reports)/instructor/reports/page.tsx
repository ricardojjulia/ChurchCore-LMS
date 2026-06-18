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
      <main className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Instructor Gradebook Reports</h1>
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <form className="flex items-center gap-2" action="/instructor/reports">
              <label htmlFor="course" className="text-sm font-medium text-slate-700">
                Course
              </label>
              <select
                id="course"
                name="course"
                defaultValue={selectedCourse?.course_id}
                className="border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950"
              >
                {completionRates.map((course) => (
                  <option key={course.course_id} value={course.course_id}>
                    {course.course_title}
                  </option>
                ))}
              </select>
              <button type="submit" className="bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
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

        <section className="mt-8 border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="overall-completion">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 id="overall-completion" className="text-lg font-semibold text-slate-950">
                Overall Completion
              </h2>
              <p className="text-sm text-slate-600">{selectedCourse?.course_title ?? 'No course selected'}</p>
            </div>
            <p className="text-2xl font-bold text-slate-950">{completionRate}%</p>
          </div>
          <TremorProgressBar value={completionRate} className="mt-4" />
        </section>

        <div className="mt-8 grid gap-8 xl:grid-cols-2">
          <section aria-labelledby="course-completion-chart">
            <h2 id="course-completion-chart" className="text-lg font-semibold text-slate-950">
              Course Completion
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

        <section className="mt-8" aria-labelledby="gradebook-table">
          <h2 id="gradebook-table" className="text-lg font-semibold text-slate-950">
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
