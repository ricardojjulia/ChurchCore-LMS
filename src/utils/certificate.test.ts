import { describe, it, expect } from 'vitest'
import { generateCertificateData, formatCompletionDate } from './certificate'

describe('formatCompletionDate', () => {
  it('formats an ISO date as long-form US English', () => {
    const result = formatCompletionDate('2026-06-15T00:00:00.000Z')
    expect(result).toContain('2026')
    expect(result).toMatch(/June|Jun/)
  })

  it('includes the day in the output', () => {
    // Use noon UTC to avoid day-boundary shifts across timezones
    const result = formatCompletionDate('2026-01-15T12:00:00.000Z')
    expect(result).toContain('15')
  })
})

describe('generateCertificateData', () => {
  const base = {
    displayName: 'Jane Doe',
    courseTitle: 'Introduction to Scripture',
    issuedAt: '2026-06-15T00:00:00.000Z',
    certificateNo: 'CERT-001',
    letterGrade: 'A',
  }

  it('returns all required fields', () => {
    const cert = generateCertificateData(base)
    expect(cert).toHaveProperty('recipientName')
    expect(cert).toHaveProperty('courseName')
    expect(cert).toHaveProperty('completionDate')
    expect(cert).toHaveProperty('certificateNo')
    expect(cert).toHaveProperty('letterGrade')
  })

  it('maps displayName to recipientName', () => {
    const cert = generateCertificateData(base)
    expect(cert.recipientName).toBe('Jane Doe')
  })

  it('falls back to "Unknown Recipient" when displayName is null', () => {
    const cert = generateCertificateData({ ...base, displayName: null })
    expect(cert.recipientName).toBe('Unknown Recipient')
  })

  it('falls back to "Unknown Recipient" when displayName is empty string', () => {
    const cert = generateCertificateData({ ...base, displayName: '  ' })
    expect(cert.recipientName).toBe('Unknown Recipient')
  })

  it('includes the formatted completion date (not the raw ISO string)', () => {
    const cert = generateCertificateData(base)
    expect(cert.completionDate).not.toContain('T00:00:00')
    expect(cert.completionDate).toContain('2026')
  })

  it('passes certificateNo and letterGrade through unchanged', () => {
    const cert = generateCertificateData(base)
    expect(cert.certificateNo).toBe('CERT-001')
    expect(cert.letterGrade).toBe('A')
  })
})
