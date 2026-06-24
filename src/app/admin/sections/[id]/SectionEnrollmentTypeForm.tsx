'use client'

import { useState, useTransition } from 'react'
import { updateSectionEnrollmentType } from '@/app/actions/academic'

const ENROLLMENT_TYPES = [
  { value: 'open',         label: 'Open Enrollment — anyone in the org can self-enroll' },
  { value: 'cohort_gated', label: 'Cohort Required — only cohort members can enroll' },
  { value: 'invite_only',  label: 'Invite Only — enrollment by admin only' },
]

export default function SectionEnrollmentTypeForm({
  sectionId,
  currentType,
}: {
  sectionId:   string
  currentType: string
}) {
  const [error, setError]   = useState<string | null>(null)
  const [ok, setOk]         = useState(false)
  const [pending, start]    = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await updateSectionEnrollmentType(sectionId, fd)
      if (result?.error) { setError(result.error); return }
      setOk(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">{error}</div>
      )}
      {ok && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm">Saved.</div>
      )}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="enrollment_type">
          Enrollment Type
        </label>
        <select
          id="enrollment_type"
          name="enrollment_type"
          defaultValue={currentType}
          className="input w-full"
        >
          {ENROLLMENT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
