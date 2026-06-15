'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createBlueprint, updateBlueprint } from '@/app/actions/academic'

interface Track { id: string; name: string; code: string }

interface Props {
  mode:        'create' | 'edit'
  blueprintId?: string
  initial?: {
    title:           string
    description:     string | null
    credits:         number | null
    program_track_id: string | null
    is_active:       boolean
  }
  tracks: Track[]
}

export default function BlueprintForm({ mode, blueprintId, initial, tracks }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [ok,    setOk]    = useState(false)
  const [pending, start]  = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null); setOk(false)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = mode === 'create'
        ? await createBlueprint(fd)
        : await updateBlueprint(blueprintId!, fd)
      if (result?.error) { setError(result.error); return }
      if (mode === 'edit') setOk(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">{error}</div>}
      {ok    && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm">Saved.</div>}

      {mode === 'create' && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="course_code">
            Course Code <span className="text-rose-500">*</span>
          </label>
          <input id="course_code" name="course_code" required
            placeholder="e.g. THEO-101" className="input w-full font-mono uppercase" />
          <p className="text-xs text-muted-foreground mt-1">Unique, auto-uppercased, immutable after creation.</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="title">
          Title <span className="text-rose-500">*</span>
        </label>
        <input id="title" name="title" required defaultValue={initial?.title}
          placeholder="e.g. Introduction to Theology" className="input w-full" />
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="description">Description</label>
        <textarea id="description" name="description" rows={3}
          defaultValue={initial?.description ?? ''}
          placeholder="Optional course description" className="input w-full resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="credits">Credits</label>
          <input id="credits" name="credits" type="number" step="0.25" min="0"
            defaultValue={initial?.credits ?? ''}
            placeholder="e.g. 3.0" className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="program_track_id">Program Track</label>
          <select id="program_track_id" name="program_track_id"
            defaultValue={initial?.program_track_id ?? ''} className="input w-full">
            <option value="">— No track —</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
        </div>
      </div>

      {mode === 'edit' && (
        <div className="flex items-center gap-2">
          <input type="checkbox" id="is_active" name="is_active" value="true"
            defaultChecked={initial?.is_active} className="rounded" />
          <label htmlFor="is_active" className="text-sm font-semibold text-foreground">Active</label>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending}
          className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
          {pending ? 'Saving…' : mode === 'create' ? 'Create Blueprint' : 'Save Changes'}
        </button>
        <Link href="/admin/blueprints"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-border hover:bg-slate-50 transition-colors text-muted-foreground">
          Cancel
        </Link>
      </div>
    </form>
  )
}
