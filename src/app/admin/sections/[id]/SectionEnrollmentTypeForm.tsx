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
    <form onSubmit={handleSubmit} className="space-y-4 text-slate-100">
      {error && (
        <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-3 text-rose-300 text-sm">{error}</div>
      )}
      {ok && (
        <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-emerald-300 text-sm">Saved.</div>
      )}
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="enrollment_type">
          Enrollment Type
        </label>
        <select
          id="enrollment_type"
          name="enrollment_type"
          defaultValue={currentType}
          className="input w-full bg-slate-800 border-slate-700 text-white"
        >
          {ENROLLMENT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-indigo-500 transition-colors disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
