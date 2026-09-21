import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import VerifyCertificatePage from './page'

// COUNCIL-2026-001 Prompt 1 — regression coverage added during PR #15 review
// after Copilot flagged this page had none. Covers: valid cert (approved
// public scope only — no grade), not-found cert. The approved scope
// (COUNCIL-APPROVED-IMPLEMENT.md) is name, course, org, date, cert no. only;
// the grade-exposure assertion below is the load-bearing one for that scope.

const maybeSingle = vi.fn()

vi.mock('@/utils/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}))

describe('VerifyCertificatePage', () => {
  it('renders the VALID banner with only the approved public fields, never a grade', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        certificate_no: 'CERT-0001',
        issued_at: '2026-01-15T00:00:00Z',
        final_grade: 97,
        letter_grade: 'A',
        courses: { title: 'Foundations of Youth Ministry' },
        profiles: { display_name: 'Jordan Rivera', organizations: { name: 'Test Church' } },
      },
      error: null,
    })

    const element = await VerifyCertificatePage({
      params: Promise.resolve({ certNo: 'CERT-0001' }),
    })
    render(element)

    expect(screen.getByText('Certificate Verified')).toBeInTheDocument()
    expect(screen.getByText('Jordan Rivera')).toBeInTheDocument()
    expect(screen.getByText('Foundations of Youth Ministry')).toBeInTheDocument()
    expect(screen.getByText('Test Church')).toBeInTheDocument()
    expect(screen.getByText('CERT-0001')).toBeInTheDocument()

    // Approved scope (COUNCIL-2026-001) never includes a grade on this
    // unauthenticated page — assert it even though the fixture data has one.
    expect(screen.queryByText('Final grade')).not.toBeInTheDocument()
    expect(screen.queryByText(/97%/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\(A\)/)).not.toBeInTheDocument()
  })

  it('renders the INVALID banner for a certificate number with no matching record', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const element = await VerifyCertificatePage({
      params: Promise.resolve({ certNo: 'NOT-REAL' }),
    })
    render(element)

    expect(screen.getByText('Certificate Not Found')).toBeInTheDocument()
    expect(screen.getByText('NOT-REAL')).toBeInTheDocument()
  })

  it('renders the INVALID banner (not a crash) when the lookup itself errors', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const element = await VerifyCertificatePage({
      params: Promise.resolve({ certNo: 'CERT-0001' }),
    })
    render(element)

    expect(screen.getByText('Certificate Not Found')).toBeInTheDocument()
  })
})
