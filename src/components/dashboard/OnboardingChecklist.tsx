import Link from 'next/link'

interface OnboardingProgress {
  logo_uploaded:                boolean
  first_teacher_invited:        boolean
  first_course_created:         boolean
  first_announcement_published: boolean
}

interface Props {
  progress: OnboardingProgress
}

const STEPS: { key: keyof OnboardingProgress; label: string; href: string }[] = [
  { key: 'logo_uploaded',                label: 'Upload your org logo',           href: '/admin/settings' },
  { key: 'first_teacher_invited',        label: 'Invite your first teacher',      href: '/admin/users' },
  { key: 'first_course_created',         label: 'Create your first course',       href: '/courses' },
  { key: 'first_announcement_published', label: 'Publish your first announcement', href: '/announcements' },
]

export default function OnboardingChecklist({ progress }: Props) {
  const completed = STEPS.filter(s => progress[s.key]).length
  const total     = STEPS.length

  if (completed === total) return null

  const pct = Math.round((completed / total) * 100)

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-indigo-900">Get started — {completed}/{total} complete</h2>
          <p className="mt-0.5 text-xs text-indigo-600">Finish setup to unlock the full ChurchCore experience.</p>
        </div>
        <span className="text-xs font-bold text-indigo-700">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 w-full rounded-full bg-indigo-200">
        <div
          className="h-1.5 rounded-full bg-indigo-600 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {STEPS.map(step => {
          const done = progress[step.key]
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold
                ${done ? 'bg-indigo-600 text-white' : 'border-2 border-indigo-300 text-transparent'}`}
              >
                ✓
              </span>
              {done ? (
                <span className="text-sm text-indigo-400 line-through">{step.label}</span>
              ) : (
                <Link href={step.href} className="text-sm font-medium text-indigo-800 hover:text-indigo-600 hover:underline">
                  {step.label}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
