export interface CertificateData {
  recipientName: string
  courseName: string
  completionDate: string
  certificateNo: string
  letterGrade: string
}

/** Formats an ISO date string as "June 15, 2026". */
export function formatCompletionDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Builds the display data for a certificate.
 * Falls back to 'Unknown Recipient' when displayName is null/empty.
 */
export function generateCertificateData(params: {
  displayName: string | null | undefined
  courseTitle: string
  issuedAt: string
  certificateNo: string
  letterGrade: string
}): CertificateData {
  return {
    recipientName: params.displayName?.trim() || 'Unknown Recipient',
    courseName: params.courseTitle,
    completionDate: formatCompletionDate(params.issuedAt),
    certificateNo: params.certificateNo,
    letterGrade: params.letterGrade,
  }
}
