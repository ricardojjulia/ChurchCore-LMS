import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Leaderboard from './Leaderboard'
import { createClient } from '@/utils/supabase/server'

// COUNCIL-2026-015 — Leaderboard Component Unit Tests

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('Leaderboard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders top 10 leaderboard entries and highlights current user', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { rank: 1, uid: 'u1', display_name: 'Alice Scholar', xp_points: 500, current_level: 3, is_current_user: false },
        { rank: 2, uid: 'u2', display_name: 'Bob Disciple', xp_points: 400, current_level: 2, is_current_user: true },
        { rank: 3, uid: 'u3', display_name: 'Charlie Student', xp_points: 300, current_level: 2, is_current_user: false },
      ],
      error: null,
    })

    vi.mocked(createClient).mockResolvedValue({
      rpc: mockRpc,
    } as any)

    const jsx = await Leaderboard()
    render(jsx!)

    expect(screen.getByText('🏆 Community Leaderboard')).toBeInTheDocument()
    expect(screen.getByText('Alice Scholar')).toBeInTheDocument()
    expect(screen.getByText('Bob Disciple')).toBeInTheDocument()
    expect(screen.getByText('(you)')).toBeInTheDocument()
    expect(screen.getByText('500 XP')).toBeInTheDocument()
    expect(mockRpc).toHaveBeenCalledWith('get_leaderboard', { p_limit: 10 })
  })

  it('renders separator and separate row when current user is outside top entries', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { rank: 1, uid: 'u1', display_name: 'Alice Scholar', xp_points: 500, current_level: 3, is_current_user: false },
        { rank: 2, uid: 'u2', display_name: 'Bob Disciple', xp_points: 400, current_level: 2, is_current_user: false },
        { rank: 15, uid: 'u15', display_name: 'Me Outside Top', xp_points: 50, current_level: 1, is_current_user: true },
      ],
      error: null,
    })

    vi.mocked(createClient).mockResolvedValue({
      rpc: mockRpc,
    } as any)

    const jsx = await Leaderboard()
    render(jsx!)

    expect(screen.getByText('· · ·')).toBeInTheDocument()
    expect(screen.getByText('Me Outside Top')).toBeInTheDocument()
    expect(screen.getByText('#15')).toBeInTheDocument()
  })

  it('renders "#1" celebration badge when current user is ranked 1', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [
        { rank: 1, uid: 'u1', display_name: 'Champion User', xp_points: 1000, current_level: 5, is_current_user: true },
        { rank: 2, uid: 'u2', display_name: 'Bob Disciple', xp_points: 400, current_level: 2, is_current_user: false },
      ],
      error: null,
    })

    vi.mocked(createClient).mockResolvedValue({
      rpc: mockRpc,
    } as any)

    const jsx = await Leaderboard()
    render(jsx!)

    expect(screen.getByText("You're #1!")).toBeInTheDocument()
  })

  it('returns null if RPC fails or returns empty data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: [],
      error: null,
    })

    vi.mocked(createClient).mockResolvedValue({
      rpc: mockRpc,
    } as any)

    const jsx = await Leaderboard()
    expect(jsx).toBeNull()
  })
})
