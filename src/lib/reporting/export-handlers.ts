import ExcelJS from 'exceljs'
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ComponentType, type ReactElement } from 'react'

import type {
  GradebookReportData,
  GradebookSummary,
  StudentReportData,
} from '@/types/reporting'

type StudentTemplateModule = {
  default?: ComponentType<{ data: StudentReportData }>
  StudentProgressPDFTemplate?: ComponentType<{ data: StudentReportData }>
}

type GradebookTemplateModule = {
  default?: ComponentType<{ data: GradebookReportData }>
  GradebookPDFTemplate?: ComponentType<{ data: GradebookReportData }>
}

function gradeLetter(grade: number | null): string {
  if (grade === null) return 'Not graded'
  if (grade >= 90) return 'A'
  if (grade >= 80) return 'B'
  if (grade >= 70) return 'C'
  if (grade >= 60) return 'D'
  return 'F'
}

async function loadStudentTemplate(): Promise<ComponentType<{ data: StudentReportData }>> {
  try {
    const templatePath = '@/components/reports/pdf/StudentProgressPDFTemplate'
    const mod = (await import(templatePath)) as StudentTemplateModule
    const Template = mod.StudentProgressPDFTemplate ?? mod.default
    if (!Template) throw new Error('StudentProgressPDFTemplate export not found')
    return Template
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown import error'
    throw new Error(`Student progress PDF template is not available until PROMPT-012: ${detail}`)
  }
}

async function loadGradebookTemplate(): Promise<ComponentType<{ data: GradebookReportData }>> {
  try {
    const templatePath = '@/components/reports/pdf/GradebookPDFTemplate'
    const mod = (await import(templatePath)) as GradebookTemplateModule
    const Template = mod.GradebookPDFTemplate ?? mod.default
    if (!Template) throw new Error('GradebookPDFTemplate export not found')
    return Template
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown import error'
    throw new Error(`Gradebook PDF template is not available until PROMPT-012: ${detail}`)
  }
}

export function estimateReportPages(rowCount: number): number {
  return Math.max(1, Math.ceil(rowCount / 25))
}

export async function generateStudentPDF(data: StudentReportData): Promise<Buffer> {
  const Template = await loadStudentTemplate()
  const document = createElement(Template, { data }) as ReactElement<DocumentProps>
  return renderToBuffer(document)
}

export async function generateGradebookPDF(data: GradebookReportData): Promise<Buffer> {
  const Template = await loadGradebookTemplate()
  const document = createElement(Template, { data }) as ReactElement<DocumentProps>
  return renderToBuffer(document)
}

export async function generateGradebookXLSX(data: GradebookSummary[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Gradebook')
  sheet.columns = [
    { header: 'Student Name',      key: 'name',        width: 30 },
    { header: 'Total Submissions', key: 'submissions',  width: 18 },
    { header: 'Average Grade',     key: 'avg',         width: 15 },
    { header: 'Last Submission',   key: 'last',        width: 22 },
    { header: 'Grade Letter',      key: 'letter',      width: 14 },
  ]
  for (const row of data) {
    sheet.addRow({
      name:        row.student_name,
      submissions: row.total_submissions,
      avg:         row.avg_grade === null ? 'Not graded' : row.avg_grade,
      last:        row.last_submission_at ?? '',
      letter:      gradeLetter(row.avg_grade),
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function generateStudentXLSX(data: StudentReportData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Student Progress')
  sheet.columns = [
    { header: 'Course Title',      key: 'title',   width: 36 },
    { header: 'Enrolled Date',     key: 'enrolled', width: 16 },
    { header: 'Completed',         key: 'done',    width: 12 },
    { header: 'Average Grade',     key: 'avg',     width: 15 },
    { header: 'Certificate Earned', key: 'cert',   width: 18 },
  ]
  for (const course of data.courses) {
    sheet.addRow({
      title:   course.courseTitle,
      enrolled: '',
      done:    course.completedAt ? 'Yes' : 'No',
      avg:     course.averageGrade === null ? 'Not graded' : course.averageGrade,
      cert:    course.certificateNo ? 'Yes' : 'No',
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
