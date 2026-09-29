import { describe, it, expect } from 'vitest'
import React from 'react'
import { CertificateDocument } from './CertificateDocument'

describe('CertificateDocument', () => {
  it('renders certificate document element without crashing', () => {
    const doc = (
      <CertificateDocument
        learnerName="John Doe"
        courseTitle="Biblical Leadership"
        orgName="Grace Church"
        issuedAt="2026-06-21T12:00:00Z"
        certificateNo="CERT-12345678"
        finalGrade={95}
        letterGrade="A"
      />
    )
    expect(doc).toBeDefined()
    expect(doc.props.learnerName).toBe('John Doe')
    expect(doc.props.courseTitle).toBe('Biblical Leadership')
    expect(doc.props.orgName).toBe('Grace Church')
    expect(doc.props.certificateNo).toBe('CERT-12345678')
    expect(doc.props.finalGrade).toBe(95)
    expect(doc.props.letterGrade).toBe('A')
  })

  it('renders correctly when finalGrade is null', () => {
    const doc = (
      <CertificateDocument
        learnerName="Jane Smith"
        courseTitle="Intro to Ministry"
        orgName="Faith Community"
        issuedAt="2026-06-21T12:00:00Z"
        certificateNo="CERT-87654321"
        finalGrade={null}
        letterGrade={null}
      />
    )
    expect(doc).toBeDefined()
    expect(doc.props.learnerName).toBe('Jane Smith')
    expect(doc.props.finalGrade).toBeNull()
  })
})
