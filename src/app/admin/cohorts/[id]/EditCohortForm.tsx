'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateCohort } from '@/app/actions/cohorts'

interface Props {
  cohortId: string
  initial: { cohort_name: string; description: string | null; program_track_id: string | null; is_active: boolean }
  tracks: Array<{ id: string; name: string }>
}

// Cohort edit form (COUNCIL-2026-044): the UI caller updateCohort never had.
export default function EditCohortForm({ cohortId, initial, tracks }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit(formData: FormData) {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await updateCohort(cohortId, formData)
      if (res.error) { setError(res.error); return }
      setSaved(true)
      router.refresh()
    })
  }

  return (
    <details className="bg-white border border-border rounded-2xl p-6 shadow-sm">
      <summary className="cursor-pointer text-sm font-bold text-foreground">Edit cohort</summary>
      <form action={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="cohort_name" className="block text-sm font-semibold text-slate-700 mb-1">Name</label>
          <input id="cohort_name" name="cohort_name" defaultValue={initial.cohort_name} required
            className="w-full border border-input rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cohort_description" className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
          <textarea id="cohort_description" name="description" defaultValue={initial.description ?? ''} rows={3}
            className="w-full border border-input rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="cohort_track" className="block text-sm font-semibold text-slate-700 mb-1">Program track</label>
          <select id="cohort_track" name="program_track_id" defaultValue={initial.program_track_id ?? ''}
            className="w-full border border-input rounded-md px-3 py-2 text-sm">
            <option value="">None</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cohort_active" className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
          <select id="cohort_active" name="is_active" defaultValue={initial.is_active ? 'true' : 'false'}
            className="w-full border border-input rounded-md px-3 py-2 text-sm">
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div className="sm:col-span-2 flex items-center gap-3">
          <button type="submit" disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          {saved && <p role="status" className="text-sm text-emerald-800">Saved.</p>}
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        </div>
      </form>
    </details>
  )
}
