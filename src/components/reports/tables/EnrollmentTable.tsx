import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import type { StudentReportData } from '@/types/reporting'

type CourseRow = StudentReportData['courses'][number]

export default async function EnrollmentTable({ courses }: { courses: CourseRow[] }) {
  const t = await getTranslations()

  if (courses.length === 0) {
    return (
      <div className="border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {t('reports.tables.enrollment.emptyState')}
      </div>
    )
  }

  return (
    <div>
      <div className="grid gap-3 sm:hidden">
        {courses.map((course) => (
          <article key={course.courseId} className="border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-slate-950">{course.courseTitle}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('reports.tables.enrollment.enrolledDateLabel')}</dt>
                <dd className="text-slate-800">{t('common.notAvailable')}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('reports.tables.enrollment.statusLabel')}</dt>
                <dd className="text-slate-800">{course.enrollmentStatus}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('reports.tables.enrollment.avgGradeLabel')}</dt>
                <dd className="text-slate-800">
                  {course.averageGrade === null ? t('common.notGraded') : `${course.averageGrade}%`}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">{t('reports.tables.enrollment.certificateLabel')}</dt>
                <dd className="text-slate-800">{course.certificateNo ? t('common.yes') : t('common.no')}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto border border-slate-200 bg-white shadow-sm sm:block">
        <table className="min-w-full text-sm" role="table">
          <caption className="sr-only">{t('reports.tables.enrollment.caption')}</caption>
          <thead className="bg-slate-50">
            <tr className="text-left">
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                {t('reports.tables.enrollment.courseNameHeader')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                {t('reports.tables.enrollment.enrolledDateLabel')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                {t('reports.tables.enrollment.completionStatusHeader')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                {t('reports.tables.enrollment.avgGradeLabel')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold text-slate-700">
                {t('reports.tables.enrollment.certificateLabel')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {courses.map((course) => (
              <tr key={course.courseId}>
                <th scope="row" className="px-4 py-3 text-left font-medium text-slate-950">
                  {course.courseTitle}
                </th>
                <td className="px-4 py-3 text-slate-700">{t('common.notAvailable')}</td>
                <td className="px-4 py-3 text-slate-700">{course.enrollmentStatus}</td>
                <td className="px-4 py-3 text-slate-700">
                  {course.averageGrade === null ? t('common.notGraded') : `${course.averageGrade}%`}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {course.certificateNo ? (
                    <Link href={`/courses/${course.courseId}/complete`} className="font-semibold text-slate-950 underline">
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
