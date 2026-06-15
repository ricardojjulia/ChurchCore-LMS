'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createTerm, updateTerm } from '@/app/actions/academic'

const TERM_TYPES = [
  { value: 'academic_year', label: 'Academic Year' },
  { value: 'semester',      label: 'Semester' },
  { value: 'trimester',     label: 'Trimester' },
  { value: 'quarter',       label: 'Quarter' },
  { value: 'block',         label: 'Block' },
  { value: 'ad_hoc',        label: 'Ad Hoc' },
  { value: 'self_paced',    label: 'Self-paced' },
  { value: 'series',        label: 'Series' },
]

interface ParentTerm { id: string; term_name: string; term_code: string }

interface Props {
  mode:        'create' | 'edit'
  termId?:     string
  initial?: {
    term_name:      string
    term_code:      string
    type:           string
    start_date:     string
    end_date:       string
    parent_term_id: string | null
    config:         object
    is_active:      boolean
  }
  parentTerms: ParentTerm[]
}

export default function TermForm({ mode, termId, initial, parentTerms }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [ok,    setOk]    = useState(false)
  const [pending, start]  = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOk(false)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = mode === 'create'
        ? await createTerm(fd)
        : await updateTerm(termId!, fd)
      if (result?.error) { setError(result.error); return }
      if (mode === 'edit') setOk(true)
    })
  }

  const configStr = initial?.config ? JSON.stringify(initial.config, null, 2) : '{}'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">{error}</div>}
      {ok    && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm">Saved.</div>}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="term_name">
            Name <span className="text-rose-500">*</span>
          </label>
          <input id="term_name" name="term_name" required defaultValue={initial?.term_name}
            placeholder="e.g. Fall Semester 2025" className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="term_code">
            Code <span className="text-rose-500">*</span>
          </label>
          <input id="term_code" name="term_code" required defaultValue={initial?.term_code}
            placeholder="e.g. FALL-2025" className="input w-full font-mono uppercase"
            readOnly={mode === 'edit'} />
          {mode === 'edit' && <p className="text-xs text-muted-foreground mt-1">Code is immutable after creation.</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="type">
          Type <span className="text-rose-500">*</span>
        </label>
        <select id="type" name="type" required defaultValue={initial?.type} className="input w-full"
          disabled={mode === 'edit'}>
          <option value="">— Select type —</option>
          {TERM_TYPES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
        {mode === 'edit' && <p className="text-xs text-muted-foreground mt-1">Type is immutable after creation.</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="start_date">
            Start Date <span className="text-rose-500">*</span>
          </label>
          <input id="start_date" name="start_date" type="date" required
            defaultValue={initial?.start_date} className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="end_date">
            End Date <span className="text-rose-500">*</span>
          </label>
          <input id="end_date" name="end_date" type="date" required
            defaultValue={initial?.end_date} className="input w-full" />
        </div>
      </div>

      {mode === 'create' && parentTerms.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="parent_term_id">
            Parent Term
          </label>
          <select id="parent_term_id" name="parent_term_id" defaultValue={initial?.parent_term_id ?? ''} className="input w-full">
            <option value="">— No parent (top-level) —</option>
            {parentTerms.map((t) => (
              <option key={t.id} value={t.id}>{t.term_name} ({t.term_code})</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">Depth is auto-computed from parent. Max depth 4.</p>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="config">
          Config <span className="text-xs font-normal text-muted-foreground">(JSON — optional overrides)</span>
        </label>
        <textarea id="config" name="config" rows={4}
          defaultValue={configStr}
          className="input w-full font-mono text-xs resize-none" />
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
          {pending ? 'Saving…' : mode === 'create' ? 'Create Term' : 'Save Changes'}
        </button>
        <Link href="/admin/terms"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-border hover:bg-slate-50 transition-colors text-muted-foreground">
          Cancel
        </Link>
      </div>
    </form>
  )
}
