import React from 'npm:react@18.3.1'
import { Document, Page, StyleSheet, Text, View } from 'npm:@react-pdf/renderer@4.5.1'

type CertificateTemplateProps = {
  certificateNo: string
  studentName: string
  courseTitle: string
  issuedAt: string
}

const styles = StyleSheet.create({
  page: {
    padding: 56,
    backgroundColor: '#F9F7F1',
    color: '#0B2545',
  },
  frame: {
    flex: 1,
    border: '4 solid #0B2545',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: '#134074',
    marginBottom: 18,
  },
  title: {
    fontSize: 34,
    fontWeight: 700,
    marginBottom: 24,
  },
  body: {
    fontSize: 14,
    marginBottom: 10,
  },
  name: {
    fontSize: 28,
    fontWeight: 700,
    marginVertical: 16,
  },
  course: {
    fontSize: 20,
    marginVertical: 12,
  },
  footer: {
    marginTop: 28,
    fontSize: 10,
    color: '#64748B',
  },
})

export default function CertificateTemplate({
  certificateNo,
  studentName,
  courseTitle,
  issuedAt,
}: CertificateTemplateProps) {
  return (
    <Document title="Course Certificate" author="ChurchCore LMS">
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <View style={styles.frame}>
          <Text style={styles.eyebrow}>ChurchCore LMS</Text>
          <Text style={styles.title}>Certificate of Completion</Text>
          <Text style={styles.body}>This certifies that</Text>
          <Text style={styles.name}>{studentName}</Text>
          <Text style={styles.body}>has completed</Text>
          <Text style={styles.course}>{courseTitle}</Text>
          <Text style={styles.footer}>
            Certificate {certificateNo} | Issued {new Date(issuedAt).toLocaleDateString()}
          </Text>
        </View>
      </Page>
    </Document>
  )
}
