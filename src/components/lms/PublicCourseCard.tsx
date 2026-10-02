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
    <li className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm hover:border-slate-700 transition-colors">
      <Link
        href={`/join/${slug}/courses/${course.id}`}
        className="text-lg font-bold text-white hover:text-indigo-400 transition-colors"
      >
        {course.title}
      </Link>
      {course.description && (
        <p className="text-sm text-slate-400 mt-2 line-clamp-3 leading-relaxed">{course.description}</p>
      )}
    </li>
  )
}
