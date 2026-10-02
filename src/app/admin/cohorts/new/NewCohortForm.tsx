'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createCohort } from '@/app/actions/cohorts'

interface Track { id: string; name: string; code: string }

export default function NewCohortForm({ tracks }: { tracks: Track[] }) {
  const [error, setError]     = useState<string | null>(null)
  const [pending, start]      = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await createCohort(fd)
      if (result?.error) setError(result.error)
      // On success createCohort calls redirect() — navigation happens automatically
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="cohort_name">
          Cohort Name <span className="text-rose-400">*</span>
        </label>
        <input
          id="cohort_name"
          name="cohort_name"
          required
          placeholder="e.g. Fall 2025 Youth Ministry"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="cohort_code">
          Code <span className="text-rose-400">*</span>
        </label>
        <input
          id="cohort_code"
          name="cohort_code"
          required
          placeholder="e.g. YOUTH-F25"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <p className="text-xs text-slate-400 mt-1">Unique identifier — auto-uppercased</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Optional — describe the cohort's purpose"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {tracks.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="program_track_id">
            Program Track
          </label>
          <select id="program_track_id" name="program_track_id" className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">— No track —</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create Cohort'}
        </button>
        <Link
          href="/admin/cohorts"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 transition-colors text-slate-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
