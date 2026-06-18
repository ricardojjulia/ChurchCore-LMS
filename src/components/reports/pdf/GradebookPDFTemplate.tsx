import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { GradebookReportData } from '@/types/reporting'

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 8,
    color: '#0B2545',
    backgroundColor: '#FFFFFF',
  },
  header: {
    borderBottom: '2 solid #0B2545',
    paddingBottom: 10,
    marginBottom: 14,
  },
  org: {
    fontSize: 9,
    color: '#134074',
    marginBottom: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  meta: {
    marginTop: 5,
    color: '#475569',
  },
  summary: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  summaryBox: {
    flexGrow: 1,
    padding: 8,
    border: '1 solid #D8E2EC',
    backgroundColor: '#F9F7F1',
  },
  summaryLabel: {
    fontSize: 7,
    color: '#64748B',
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: 700,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0B2545',
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #EEF2F6',
  },
  rowAlt: {
    backgroundColor: '#F8FAFC',
  },
  nameCell: {
    width: '36%',
    padding: 6,
  },
  cell: {
    width: '16%',
    padding: 6,
  },
  headerCell: {
    width: '16%',
    padding: 6,
    fontWeight: 700,
  },
  headerNameCell: {
    width: '36%',
    padding: 6,
    fontWeight: 700,
  },
  gradeA: {
    color: '#15803D',
  },
  gradeB: {
    color: '#1D4ED8',
  },
  gradeC: {
    color: '#B45309',
  },
  gradeLow: {
    color: '#B91C1C',
  },
  note: {
    marginTop: 8,
    color: '#64748B',
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 32,
    right: 32,
    borderTop: '1 solid #D8E2EC',
    paddingTop: 5,
    fontSize: 7,
    color: '#64748B',
  },
})

function gradeLetter(grade: number | null): string {
  if (grade === null) return 'Not graded'
  if (grade >= 90) return 'A'
  if (grade >= 80) return 'B'
  if (grade >= 70) return 'C'
  if (grade >= 60) return 'D'
  return 'F'
}

function gradeStyle(grade: number | null) {
  const letter = gradeLetter(grade)
  if (letter === 'A') return styles.gradeA
  if (letter === 'B') return styles.gradeB
  if (letter === 'C') return styles.gradeC
  return styles.gradeLow
}

function averageGrade(data: GradebookReportData): string {
  const grades = data.students
    .map((student) => student.averageGrade)
    .filter((grade): grade is number => grade !== null)

  if (grades.length === 0) return 'Not graded'
  return `${(grades.reduce((sum, grade) => sum + grade, 0) / grades.length).toFixed(1)}%`
}

function distribution(data: GradebookReportData): string {
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 }
  for (const student of data.students) {
    const letter = gradeLetter(student.averageGrade)
    if (letter in counts) counts[letter as keyof typeof counts] += 1
  }
  return `A ${counts.A} / B ${counts.B} / C ${counts.C} / D ${counts.D} / F ${counts.F}`
}

export function GradebookPDFTemplate({ data }: { data: GradebookReportData }) {
  const orgName = data.orgId
  const students = [...data.students].sort((a, b) => a.studentName.localeCompare(b.studentName))

  return (
    <Document title="Gradebook Report" author="ChurchCore LMS">
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>
            {orgName}
          </Text>
          <Text style={styles.title}>
            Gradebook Report | {data.courseTitle}
          </Text>
          <Text style={styles.meta}>
            Instructor: {data.instructorName ?? 'Not assigned'} | Generated{' '}
            {new Date(data.generatedAt).toLocaleString()} | Data as of {new Date(data.generatedAt).toLocaleString()}
          </Text>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Students</Text>
            <Text style={styles.summaryValue}>{students.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Class Average</Text>
            <Text style={styles.summaryValue}>{averageGrade(data)}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Distribution</Text>
            <Text style={styles.summaryValue}>{distribution(data)}</Text>
          </View>
        </View>

        <View style={styles.tableHeader} fixed>
          <Text style={styles.headerNameCell}>Student Name</Text>
          <Text style={styles.headerCell}>Submissions</Text>
          <Text style={styles.headerCell}>Avg Grade</Text>
          <Text style={styles.headerCell}>Letter</Text>
          <Text style={styles.headerCell}>Last Submission</Text>
        </View>

        {students.map((student, index) => (
          <View
            key={student.studentId}
            style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]}
            break={index > 0 && index % 30 === 0}
          >
            <Text style={styles.nameCell}>
              {student.studentName}
            </Text>
            <Text style={styles.cell}>
              {student.totalSubmissions}
            </Text>
            <Text style={[styles.cell, gradeStyle(student.averageGrade)]}>
              {student.averageGrade === null ? 'Not graded' : `${student.averageGrade.toFixed(1)}%`}
            </Text>
            <Text style={[styles.cell, gradeStyle(student.averageGrade)]}>
              {gradeLetter(student.averageGrade)}
            </Text>
            <Text style={styles.cell}>
              {student.lastSubmissionAt ? new Date(student.lastSubmissionAt).toLocaleDateString() : 'None'}
            </Text>
          </View>
        ))}

        <Text style={styles.note}>
          Table limited to required gradebook columns for A4 landscape readability.
        </Text>

        <Text
          fixed
          style={styles.footer}
          render={({ pageNumber, totalPages }) =>
            `Generated by ChurchCore LMS | ${orgName} | ${data.generatedAt} | Page ${pageNumber} of ${totalPages}. This document contains educational records protected under applicable privacy regulations.`
          }
        />
      </Page>
    </Document>
  )
}

export default GradebookPDFTemplate
