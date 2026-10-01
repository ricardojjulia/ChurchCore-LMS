import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import EngagementWidget from './EngagementWidget'
import { createClient } from '@/utils/supabase/server'

// COUNCIL-2026-006 — Engagement Widget Component Unit Tests

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string, values?: any) => {
    const map: Record<string, string> = {
      formationProgress: 'Formation Progress',
      totalXp: 'Total XP',
      dayStreak: 'Day streak',
      level: 'Level',
      recentActivity: 'Recent Activity',
      completeLessonHint: 'Complete a lesson to start tracking your progress.',
    }
    if (key === 'longestStreak') {
      return `Longest streak: ${values?.days} days`
    }
    return map[key] ?? key
  }),
}))

describe('EngagementWidget Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders stats, streak, level, and recent activity', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'engagement_streaks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { current_streak: 5, longest_streak: 12, last_event_date: '2026-09-29' },
            error: null,
          }),
        }
      }
      if (table === 'engagement_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              { id: 'ev-1', event_type: 'block_completion', xp_earned: 10, recorded_at: '2026-09-29T10:00:00Z' },
              { id: 'ev-2', event_type: 'quiz_pass', xp_earned: 25, recorded_at: '2026-09-28T10:00:00Z' },
            ],
            error: null,
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { xp_points: 350, current_level: 2 },
            error: null,
          }),
        }
      }
      return { select: vi.fn().mockReturnThis() }
    })

    vi.mocked(createClient).mockResolvedValue({
      from: mockFrom,
    } as any)

    const jsx = await EngagementWidget({ uid: '00000000-0000-0000-0002-000000000003' })
    render(jsx)

    expect(screen.getByText('Formation Progress')).toBeInTheDocument()
    expect(screen.getByText('350')).toBeInTheDocument()
    expect(screen.getByText('5🔥')).toBeInTheDocument()
    expect(screen.getByText('Level')).toBeInTheDocument()
    expect(screen.getByText('Completed a lesson')).toBeInTheDocument()
    expect(screen.getByText('Passed a quiz')).toBeInTheDocument()
    expect(screen.getByText('+10 XP')).toBeInTheDocument()
    expect(screen.getByText('+25 XP')).toBeInTheDocument()
    expect(screen.getByText('Longest streak: 12 days')).toBeInTheDocument()
  })

  it('renders friendly fallback when no engagement events exist', async () => {
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'engagement_streaks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
      }
      if (table === 'engagement_events') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { xp_points: 0, current_level: 1 }, error: null }),
        }
      }
      return { select: vi.fn().mockReturnThis() }
    })

    vi.mocked(createClient).mockResolvedValue({
      from: mockFrom,
    } as any)

    const jsx = await EngagementWidget({ uid: '00000000-0000-0000-0002-000000000003' })
    render(jsx)

    expect(screen.getByText('Complete a lesson to start tracking your progress.')).toBeInTheDocument()
  })
})
