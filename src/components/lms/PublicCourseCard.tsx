import Link from 'next/link'

interface PublicCourseCardProps {
  slug: string
  course: {
    id: string
    title: string
    description: string | null
  }
}

// COUNCIL-2026-027 Prompt C — public-safe course card. Deliberately not a
// reuse of src/components/lms/CourseCard.tsx: that component's footer
// hard-codes a /courses/${id} link to the authenticated route, which would
// silently bounce an anon visitor to /login if reused unmodified here.
export default function PublicCourseCard({ slug, course }: PublicCourseCardProps) {
  return (
    <li className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
      <Link
        href={`/join/${slug}/courses/${course.id}`}
        className="text-lg font-semibold text-slate-900 hover:text-primary transition-colors"
      >
        {course.title}
      </Link>
      {course.description && (
        <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{course.description}</p>
      )}
    </li>
  )
}
