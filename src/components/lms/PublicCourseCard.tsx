import Link from 'next/link'

interface PublicCourseCardProps {
  slug: string
  course: {
    id: string
    title: string
    description: string | null
    price_cents?: number | null
    currency?: string | null
  }
}

// COUNCIL-2026-027 Prompt C — public-safe course card. Deliberately not a
// reuse of src/components/lms/CourseCard.tsx: that component's footer
// hard-codes a /courses/${id} link to the authenticated route, which would
// silently bounce an anon visitor to /login if reused unmodified here.
export default function PublicCourseCard({ slug, course }: PublicCourseCardProps) {
  const isPaid = typeof course.price_cents === 'number' && course.price_cents > 0
  const formattedPrice = isPaid
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: (course.currency || 'usd').toUpperCase(),
      }).format(course.price_cents! / 100)
    : 'Free'

  return (
    <li className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/join/${slug}/courses/${course.id}`}
          className="text-lg font-bold text-white hover:text-indigo-400 transition-colors"
        >
          {course.title}
        </Link>
        <span
          className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${
            isPaid
              ? 'bg-amber-950/70 border border-amber-800/80 text-amber-300'
              : 'bg-emerald-950/70 border border-emerald-800/80 text-emerald-300'
          }`}
        >
          {formattedPrice}
        </span>
      </div>
      {course.description && (
        <p className="text-sm text-slate-400 mt-2 line-clamp-3 leading-relaxed">{course.description}</p>
      )}
    </li>
  )
}

