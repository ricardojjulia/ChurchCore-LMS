import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import { createElement, type ComponentType, type ReactElement } from 'react'
import { utils, write } from 'xlsx'

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

export function generateGradebookXLSX(data: GradebookSummary[]): Buffer {
  const worksheet = utils.json_to_sheet(
    data.map((row) => ({
      'Student Name': row.student_name,
      'Total Submissions': row.total_submissions,
      'Average Grade': row.avg_grade === null ? 'Not graded' : row.avg_grade,
      'Last Submission': row.last_submission_at ?? '',
      'Grade Letter': gradeLetter(row.avg_grade),
    }))
  )
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'Gradebook')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export function generateStudentXLSX(data: StudentReportData): Buffer {
  const worksheet = utils.json_to_sheet(
    data.courses.map((course) => ({
      'Course Title': course.courseTitle,
      'Enrolled Date': '',
      Completed: course.completedAt ? 'Yes' : 'No',
      'Average Grade': course.averageGrade === null ? 'Not graded' : course.averageGrade,
      'Certificate Earned': course.certificateNo ? 'Yes' : 'No',
    }))
  )
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'Student Progress')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}
