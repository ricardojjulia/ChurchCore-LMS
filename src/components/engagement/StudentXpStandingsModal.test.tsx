import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import StudentXpStandingsModal from './StudentXpStandingsModal'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      studentStandings: 'Student XP Standings',
      communityLeaderboard: 'Formation rank & community XP leaderboard',
    }
    return map[key] ?? key
  },
}))

describe('StudentXpStandingsModal Component', () => {
  it('renders trigger button with "Student XP Standings" by default', () => {
    render(
      <StudentXpStandingsModal>
        <div>Leaderboard Content</div>
      </StudentXpStandingsModal>
    )

    const button = screen.getByRole('button', { name: /Student XP Standings/i })
    expect(button).toBeInTheDocument()
    expect(screen.queryByText('Leaderboard Content')).not.toBeInTheDocument()
  })

  it('opens modal on click and renders children and full page link', () => {
    render(
      <StudentXpStandingsModal>
        <div>Mock Leaderboard Content</div>
      </StudentXpStandingsModal>
    )

    const button = screen.getByRole('button', { name: /Student XP Standings/i })
    fireEvent.click(button)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Mock Leaderboard Content')).toBeInTheDocument()
    expect(screen.getByText('Full Page')).toBeInTheDocument()
  })

  it('closes modal when close button is clicked', () => {
    render(
      <StudentXpStandingsModal>
        <div>Mock Leaderboard Content</div>
      </StudentXpStandingsModal>
    )

    fireEvent.click(screen.getByRole('button', { name: /Student XP Standings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    const closeBtn = screen.getByRole('button', { name: /Close standings modal/i })
    fireEvent.click(closeBtn)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes modal on Escape key press', () => {
    render(
      <StudentXpStandingsModal>
        <div>Mock Leaderboard Content</div>
      </StudentXpStandingsModal>
    )

    fireEvent.click(screen.getByRole('button', { name: /Student XP Standings/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
