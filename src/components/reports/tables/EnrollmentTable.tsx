import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import type { StudentReportData } from '@/types/reporting'

type CourseRow = StudentReportData['courses'][number]

export default async function EnrollmentTable({ courses }: { courses: CourseRow[] }) {
  const t = await getTranslations()

  if (courses.length === 0) {
    return (
      <div className="card-crisp p-6 text-sm text-slate-400">
        {t('reports.tables.enrollment.emptyState')}
      </div>
    )
  }

  return (
    <div>
      <div className="grid gap-3 sm:hidden">
        {courses.map((course) => (
          <article key={course.courseId} className="card-crisp p-4">
            <h3 className="font-semibold text-white">{course.courseTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">{t('reports.tables.enrollment.enrolledDateLabel')}</dt>
                <dd className="text-slate-200">{t('common.notAvailable')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">{t('reports.tables.enrollment.statusLabel')}</dt>
                <dd className="text-slate-200">{course.enrollmentStatus}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">{t('reports.tables.enrollment.avgGradeLabel')}</dt>
                <dd className="text-slate-200">
                  {course.averageGrade === null ? t('common.notGraded') : `${course.averageGrade}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-400">{t('reports.tables.enrollment.certificateLabel')}</dt>
                <dd className="text-slate-200">{course.certificateNo ? t('common.yes') : t('common.no')}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto card-crisp overflow-hidden sm:block">
        <table className="min-w-full text-sm" role="table">
          <caption className="sr-only">{t('reports.tables.enrollment.caption')}</caption>
          <thead className="bg-slate-900/80 border-b border-slate-800">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                {t('reports.tables.enrollment.courseNameHeader')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                {t('reports.tables.enrollment.enrolledDateLabel')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                {t('reports.tables.enrollment.completionStatusHeader')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                {t('reports.tables.enrollment.avgGradeLabel')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-300">
                {t('reports.tables.enrollment.certificateLabel')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {courses.map((course) => (
              <tr key={course.courseId} className="hover:bg-slate-800/40 transition-colors">
                <th scope="row" className="px-4 py-3 text-left font-medium text-white">
                  {course.courseTitle}
                </th>
                <td className="px-4 py-3 text-slate-400">{t('common.notAvailable')}</td>
                <td className="px-4 py-3 text-slate-300">{course.enrollmentStatus}</td>
                <td className="px-4 py-3 text-slate-300">
                  {course.averageGrade === null ? t('common.notGraded') : `${course.averageGrade}%`}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {course.certificateNo ? (
                    <Link href={`/courses/${course.courseId}/complete`} className="font-semibold text-amber-300 hover:text-amber-200 underline transition-colors">
                      {t('common.yes')}
                    </Link>
                  ) : (
                    t('common.no')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
