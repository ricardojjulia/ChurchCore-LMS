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
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">
          {error}
        </div>
      )}
      {ok && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm">
          Saved.
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="name">
          Name <span className="text-rose-500">*</span>
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="e.g. Youth Ministry"
          className="input w-full"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="code">
          Code <span className="text-rose-500">*</span>
        </label>
        <input
          id="code"
          name="code"
          required={mode === 'create'}
          readOnly={mode === 'edit'}
          defaultValue={initial?.code}
          placeholder="e.g. YM"
          className="input w-full font-mono uppercase"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {mode === 'create'
            ? 'Unique identifier — auto-uppercased.'
            : 'Code is immutable after creation.'}
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={initial?.description ?? ''}
          placeholder="Optional — describe what belongs in this track"
          className="input w-full resize-none"
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
            className="rounded"
          />
          <label htmlFor="is_active" className="text-sm font-semibold text-foreground">
            Active
          </label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {pending ? 'Saving…' : mode === 'create' ? 'Create Program Track' : 'Save Changes'}
        </button>
        <Link
          href="/admin/program-tracks"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-border hover:bg-slate-50 transition-colors text-muted-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  )
}
