import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@/lib/supabase/server'
import {
  buildStudentReportData,
  getCourseCompletionRates,
} from '@/lib/reporting/report-aggregates'
import ModuleCompletionChart from '@/components/reports/charts/ModuleCompletionChart'
import GradeHistoryChart from '@/components/reports/charts/GradeHistoryChart'
import EnrollmentTable from '@/components/reports/tables/EnrollmentTable'
import StudentProgressSkeleton from '@/components/reports/StudentProgressSkeleton'
import ExportButton from '@/components/reports/ExportButton'
import { generateStudentProgressReport, generateStudentXLSXExport } from './actions'

type Profile = {
  uid: string
  org_id: string | null
}

async function EmptyState() {
  const t = await getTranslations()
  return (
    <div className="mt-8 border border-slate-200 bg-white p-10 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-slate-950">{t('reports.student.emptyHeading')}</h2>
      <p className="mt-2 text-sm text-slate-600">
        {t('reports.student.emptyDescription')}
      </p>
    </div>
  )
}

export default async function StudentReportsPage() {
  const t = await getTranslations()
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
          <h1 className="text-2xl font-bold text-slate-950">{t('reports.student.heading')}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('reports.student.lastUpdatedTemplate', {
              date: new Date(latestRefresh ?? reportData.generatedAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <ExportButton label={t('reports.student.exportPdfButton')} format="pdf" action={generateStudentProgressReport} />
          <ExportButton label={t('reports.student.exportXlsxButton')} format="xlsx" action={generateStudentXLSXExport} />
        </div>
      </div>

      <noscript>
        <p className="mt-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t('reports.student.noscriptFallback')}
        </p>
      </noscript>

      {reportData.courses.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 space-y-8">
          <Suspense fallback={<StudentProgressSkeleton variant="chart" />}>
            <section aria-labelledby="module-completion-heading">
              <h2 id="module-completion-heading" className="text-lg font-semibold text-slate-950">
                {t('reports.student.moduleCompletionHeading')}
              </h2>
              <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
                <ModuleCompletionChart data={moduleCompletionData} />
              </div>
            </section>
          </Suspense>

          <Suspense fallback={<StudentProgressSkeleton variant="chart" />}>
            <section aria-labelledby="grade-history-heading">
              <h2 id="grade-history-heading" className="text-lg font-semibold text-slate-950">
                {t('reports.student.gradeHistoryHeading')}
              </h2>
              <div className="mt-3 border border-slate-200 bg-white p-4 shadow-sm">
                <GradeHistoryChart data={gradeHistoryData} />
              </div>
            </section>
          </Suspense>

          <Suspense fallback={<StudentProgressSkeleton variant="table" />}>
            <section aria-labelledby="enrollment-table-heading">
              <h2 id="enrollment-table-heading" className="text-lg font-semibold text-slate-950">
                {t('reports.student.courseEnrollmentsHeading')}
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
