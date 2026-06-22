import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

interface Props {
  learnerName:  string
  courseTitle:  string
  orgName:      string
  issuedAt:     string
  certificateNo: string
  finalGrade?:  number | null
  letterGrade?: string | null
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    padding: 60,
    fontFamily: 'Helvetica',
  },
  border: {
    flex: 1,
    border: '3px solid #4F46E5',
    borderRadius: 4,
    padding: 40,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Header
  orgLabel: {
    fontFamily: 'Helvetica',
    fontSize: 11,
    color: '#6B7280',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 4,
    textAlign: 'center',
  },
  orgName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: '#4F46E5',
    textAlign: 'center',
    marginBottom: 32,
  },
  // Main heading
  heading: {
    fontFamily: 'Times-Roman',
    fontSize: 32,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 28,
  },
  divider: {
    width: 80,
    height: 2,
    backgroundColor: '#4F46E5',
    marginBottom: 28,
  },
  // Body text
  body: {
    fontFamily: 'Helvetica',
    fontSize: 13,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
  },
  learnerName: {
    fontFamily: 'Times-Bold',
    fontSize: 26,
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  courseTitle: {
    fontFamily: 'Helvetica-BoldOblique',
    fontSize: 16,
    color: '#4F46E5',
    textAlign: 'center',
    marginBottom: 28,
  },
  gradeRow: {
    marginTop: 4,
    marginBottom: 20,
    textAlign: 'center',
  },
  gradeText: {
    fontFamily: 'Helvetica',
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  // Footer
  footer: {
    marginTop: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerItem: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  footerLabel: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#9CA3AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  footerValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: '#374151',
  },
  certNo: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: '#9CA3AF',
    letterSpacing: 1,
    fontStyle: 'italic',
  },
})

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function CertificateDocument({
  learnerName, courseTitle, orgName, issuedAt, certificateNo, finalGrade, letterGrade,
}: Props) {
  return (
    <Document title={`Certificate — ${courseTitle}`} author={orgName}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.border}>
          {/* Org header */}
          <Text style={styles.orgLabel}>Presented by</Text>
          <Text style={styles.orgName}>{orgName}</Text>

          {/* Heading */}
          <Text style={styles.heading}>Certificate of Completion</Text>
          <View style={styles.divider} />

          {/* Body */}
          <Text style={styles.body}>This certifies that</Text>
          <Text style={styles.learnerName}>{learnerName}</Text>
          <Text style={styles.body}>has successfully completed</Text>
          <Text style={styles.courseTitle}>{courseTitle}</Text>

          {/* Grade — omit if null */}
          {finalGrade != null && (
            <View style={styles.gradeRow}>
              <Text style={styles.gradeText}>
                Final Grade: {Math.round(finalGrade)}%{letterGrade ? ` (${letterGrade})` : ''}
              </Text>
            </View>
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Date Issued</Text>
              <Text style={styles.footerValue}>{formatDate(issuedAt)}</Text>
            </View>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Certificate No.</Text>
              <Text style={styles.certNo}>{certificateNo}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
