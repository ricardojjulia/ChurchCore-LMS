'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createProgramTrack, updateProgramTrack } from '@/app/actions/academic'

interface Props {
  mode:     'create' | 'edit'
  trackId?: string
  initial?: {
    name:        string
    code:        string
    description: string | null
    is_active:   boolean
  }
}

export default function ProgramTrackForm({ mode, trackId, initial }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [pending, start] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)

    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = mode === 'create'
        ? await createProgramTrack(fd)
        : await updateProgramTrack(trackId!, fd)

      if (result?.error) {
        setError(result.error)
        return
      }
      if (mode === 'edit') setOk(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-rose-300 text-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="bg-emerald-950/50 border border-emerald-800 rounded-xl p-3 text-emerald-300 text-sm">
          Saved.
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="name">
          Name <span className="text-rose-400">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="e.g. Youth Ministry"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="code">
          Code <span className="text-rose-400">*</span>
        </label>
        <input
          id="code"
          name="code"
          required={mode === 'create'}
          readOnly={mode === 'edit'}
          defaultValue={initial?.code}
          placeholder="e.g. YM"
          className={`w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500${mode === 'edit' ? ' opacity-60 cursor-not-allowed' : ''}`}
        />
        <p className="text-xs text-slate-400 mt-1">
          {mode === 'create'
            ? 'Unique identifier — auto-uppercased.'
            : 'Code is immutable after creation.'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initial?.description ?? ''}
          placeholder="Optional — describe what belongs in this track"
          className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {mode === 'edit' && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            name="is_active"
            value="true"
            defaultChecked={initial?.is_active}
            className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="is_active" className="text-sm font-semibold text-slate-200">
            Active
          </label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Create Program Track' : 'Save Changes'}
        </button>
        <Link
          href="/admin/program-tracks"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 transition-colors text-slate-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
