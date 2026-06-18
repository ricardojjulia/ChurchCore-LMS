import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'

import type { StudentReportData } from '@/types/reporting'

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    color: '#0B2545',
    backgroundColor: '#FFFFFF',
  },
  header: {
    borderBottom: '2 solid #0B2545',
    paddingBottom: 12,
    marginBottom: 16,
  },
  org: {
    fontSize: 10,
    color: '#134074',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#0B2545',
  },
  meta: {
    marginTop: 6,
    color: '#475569',
  },
  summary: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  summaryBox: {
    flexGrow: 1,
    padding: 10,
    border: '1 solid #D8E2EC',
    backgroundColor: '#F9F7F1',
  },
  summaryLabel: {
    fontSize: 7,
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: 700,
  },
  section: {
    marginBottom: 14,
    border: '1 solid #D8E2EC',
  },
  sectionHeader: {
    padding: 8,
    backgroundColor: '#0B2545',
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
  },
  sectionMeta: {
    marginTop: 3,
    fontSize: 8,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#EAF0F6',
    borderBottom: '1 solid #D8E2EC',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #EEF2F6',
  },
  rowAlt: {
    backgroundColor: '#F8FAFC',
  },
  cell: {
    padding: 6,
    width: '33.33%',
  },
  cellHeader: {
    padding: 6,
    width: '33.33%',
    fontWeight: 700,
  },
  empty: {
    padding: 8,
    color: '#64748B',
  },
  certificates: {
    marginTop: 8,
    padding: 10,
    border: '1 solid #D8E2EC',
  },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 36,
    right: 36,
    borderTop: '1 solid #D8E2EC',
    paddingTop: 6,
    fontSize: 7,
    color: '#64748B',
  },
})

function averageGrade(data: StudentReportData): string {
  const grades = data.courses
    .map((course) => course.averageGrade)
    .filter((grade): grade is number => grade !== null)

  if (grades.length === 0) return 'Not graded'
  return `${(grades.reduce((sum, grade) => sum + grade, 0) / grades.length).toFixed(1)}%`
}

export function StudentProgressPDFTemplate({ data }: { data: StudentReportData }) {
  const orgName = data.orgId
  const completed = data.courses.filter((course) => course.completedAt).length
  const certificates = data.courses.filter((course) => course.certificateNo)

  return (
    <Document title="Student Progress Report" author="ChurchCore LMS">
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>
            {orgName}
          </Text>
          <Text style={styles.title}>
            Student Progress Report
          </Text>
          <Text style={styles.meta}>
            Generated {new Date(data.generatedAt).toLocaleString()} | {data.studentName}
          </Text>
        </View>

        <View style={styles.summary}>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Courses Enrolled</Text>
            <Text style={styles.summaryValue}>{data.courses.length}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Completed</Text>
            <Text style={styles.summaryValue}>{completed}</Text>
          </View>
          <View style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>Average Grade</Text>
            <Text style={styles.summaryValue}>{averageGrade(data)}</Text>
          </View>
        </View>

        {data.courses.map((course) => (
          <View key={course.courseId} style={styles.section} wrap={false}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {course.courseTitle}
              </Text>
              <Text style={styles.sectionMeta}>
                Enrolled date not available | {course.completedAt ? 'Complete' : 'In Progress'} | Progress{' '}
                {course.progressPercent}%
              </Text>
            </View>
            <View style={styles.tableHeader}>
              <Text style={styles.cellHeader}>Assignment</Text>
              <Text style={styles.cellHeader}>Submitted</Text>
              <Text style={styles.cellHeader}>Grade</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.empty}>
                No assignment detail is available in this export yet.
              </Text>
            </View>
          </View>
        ))}

        <View style={styles.certificates}>
          <Text style={styles.sectionTitle}>Certificates Earned</Text>
          {certificates.length === 0 ? (
            <Text style={styles.empty}>No certificates earned yet.</Text>
          ) : (
            certificates.map((course, index) => (
              <View key={course.courseId} style={[styles.row, index % 2 === 1 ? styles.rowAlt : {}]}>
                <Text style={styles.cell}>
                  {course.courseTitle}
                </Text>
                <Text style={styles.cell}>
                  {course.certificateNo}
                </Text>
                <Text style={styles.cell}>
                  Issue date not available
                </Text>
              </View>
            ))
          )}
        </View>

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

export default StudentProgressPDFTemplate
