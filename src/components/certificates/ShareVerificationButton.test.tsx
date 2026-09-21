import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { ShareVerificationButton } from './ShareVerificationButton'

// COUNCIL-2026-001 Prompt 2 — regression coverage added during PR #15 review
// after Copilot flagged this component had none. Covers the copy-to-clipboard
// happy path and the graceful new-tab fallback when the Clipboard API throws
// (e.g. permission denied, insecure context, unsupported browser).

describe('ShareVerificationButton', () => {
  const originalOpen = window.open

  afterEach(() => {
    window.open = originalOpen
    vi.restoreAllMocks()
  })

  it('copies the verification URL and shows "Copied!" on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<ShareVerificationButton certNo="CERT-0001" />)

    fireEvent.click(screen.getByRole('button', { name: /copy verification link/i }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('/verify/CERT-0001'),
    ))
    await waitFor(() => expect(screen.getByText('Copied!')).toBeInTheDocument())
  })

  it('reverts back to "Share" after the copied state times out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<ShareVerificationButton certNo="CERT-0001" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy verification link/i }))
    })

    expect(screen.getByText('Copied!')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })

    expect(screen.getByText('Share')).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('falls back to opening the verification page in a new tab when the clipboard write throws', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard unavailable'))
    Object.assign(navigator, { clipboard: { writeText } })
    const openSpy = vi.fn()
    window.open = openSpy

    render(<ShareVerificationButton certNo="CERT-0001" />)
    fireEvent.click(screen.getByRole('button', { name: /copy verification link/i }))

    await waitFor(() => expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('/verify/CERT-0001'),
      '_blank',
      'noopener,noreferrer',
    ))

    // The fallback path never claims success — no "Copied!" state.
    expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
  })
})
