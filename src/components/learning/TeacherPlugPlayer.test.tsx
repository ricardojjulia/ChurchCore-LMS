import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import TeacherPlugPlayer from './TeacherPlugPlayer'
import { createClient } from '@/utils/supabase/client'

vi.mock('@/utils/supabase/client', () => ({
  createClient: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      'learning.teacherPlug.yourInstructorLabel': 'Your Instructor',
      'learning.teacherPlug.notFoundError': 'Instructor card not available.',
    }
    return map[key] ?? key
  },
}))

describe('TeacherPlugPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders teacher details when teacher profile belongs to the same org', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                display_name: 'Pastor John',
                bio: 'Experienced teacher of theology.',
                specialty: ['Hermeneutics', 'Pastoral Care'],
                website_url: 'https://pastorjohn.com',
                avatar_url: null,
                org_id: 'org-123',
              },
              error: null,
            }),
          }),
        }),
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/pic.jpg' } }),
        }),
      },
    }

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    render(
      <TeacherPlugPlayer
        blockContent={{
          teacher_uid: 'teacher-1',
          bio_override: null,
          specialty: null,
          website: null,
        }}
        orgId="org-123"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Pastor John')).toBeDefined()
    })
    expect(screen.getByText('Experienced teacher of theology.')).toBeDefined()
    expect(screen.getByText('Hermeneutics')).toBeDefined()
    expect(screen.getByText('Pastoral Care')).toBeDefined()
    expect(screen.getByText('pastorjohn.com →')).toBeDefined()
  })

  it('renders error placeholder when teacher belongs to a different org (tenant isolation check)', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                display_name: 'Other Org Pastor',
                org_id: 'other-org',
              },
              error: null,
            }),
          }),
        }),
      }),
    }

    vi.mocked(createClient).mockReturnValue(mockSupabase as any)

    render(
      <TeacherPlugPlayer
        blockContent={{
          teacher_uid: 'teacher-foreign',
        }}
        orgId="org-123"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Instructor card not available.')).toBeDefined()
    })
  })
})
