import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CourseForm from './CourseForm'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}))

const blueprints = [
  {
    id: 'bp-001',
    title: 'Foundations of Youth Ministry',
    course_code: 'YTH-101',
    program_tracks: { name: 'Youth Ministry', code: 'YM' },
  },
]

describe('CourseForm academic placement', () => {
  it('shows academic placement and blueprint selection when creating a course', () => {
    render(
      <CourseForm
        userId="profile-001"
        existingCourses={[]}
        blueprints={blueprints}
      />,
    )

    expect(screen.getByText('Academic Placement')).toBeInTheDocument()
    expect(screen.getByLabelText(/Course Blueprint/i)).toBeInTheDocument()
    expect(screen.getByRole('option', {
      name: 'YTH-101 — Foundations of Youth Ministry (YM)',
    })).toBeInTheDocument()
  })

  it('shows quick links for the related academic records', () => {
    render(
      <CourseForm
        userId="profile-001"
        existingCourses={[]}
        blueprints={blueprints}
      />,
    )

    expect(screen.getByRole('link', { name: 'Create Program Track' }))
      .toHaveAttribute('href', '/admin/program-tracks/new')
    expect(screen.getByRole('link', { name: 'Create Blueprint' }))
      .toHaveAttribute('href', '/admin/blueprints/new')
    expect(screen.getByRole('link', { name: 'Create Term' }))
      .toHaveAttribute('href', '/admin/terms/new')
    expect(screen.getByRole('link', { name: 'Create Section' }))
      .toHaveAttribute('href', '/admin/sections/new')
  })
})
