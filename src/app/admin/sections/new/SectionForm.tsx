'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createSection } from '@/app/actions/academic'

interface Blueprint { id: string; title: string; course_code: string }
interface Term      { id: string; term_name: string; term_code: string }

const FORMATS = [
  { value: 'synchronous',  label: 'Synchronous (live, scheduled)' },
  { value: 'asynchronous', label: 'Asynchronous (self-paced within window)' },
  { value: 'hybrid',       label: 'Hybrid (mix of live + async)' },
  { value: 'self_paced',   label: 'Self-paced (no access window required)' },
]

const ENROLLMENT_TYPES = [
  { value: 'open',          label: 'Open Enrollment — anyone in the org can self-enroll' },
  { value: 'cohort_gated',  label: 'Cohort Required — only cohort members can enroll' },
  { value: 'invite_only',   label: 'Invite Only — enrollment by admin only' },
]

export default function SectionForm({
  blueprints, terms, initialBlueprintId = '',
}: {
  blueprints: Blueprint[]
  terms:      Term[]
  initialBlueprintId?: string
}) {
  const [error, setError]     = useState<string | null>(null)
  const [format, setFormat]   = useState('asynchronous')
  const [pending, start]      = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    start(async () => {
      const result = await createSection(fd)
      if (result?.error) setError(result.error)
      // On success, createSection redirects to the new section's page
    })
  }

  const needsWindow = format !== 'self_paced'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm">{error}</div>}

      {/* Blueprint + Term */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="blueprint_id">
            Blueprint <span className="text-rose-500">*</span>
          </label>
          <select id="blueprint_id" name="blueprint_id" required defaultValue={initialBlueprintId} className="input w-full">
            <option value="">— Select blueprint —</option>
            {blueprints.map((b) => (
              <option key={b.id} value={b.id}>{b.title} ({b.course_code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="term_id">
            Term <span className="text-rose-500">*</span>
          </label>
          <select id="term_id" name="term_id" required className="input w-full">
            <option value="">— Select term —</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.term_name} ({t.term_code})</option>
            ))}
          </select>
        </div>
      </div>

      {/* Section code + format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="section_code">
            Section Code <span className="text-rose-500">*</span>
          </label>
          <input id="section_code" name="section_code" required
            placeholder="e.g. 001 or A" className="input w-full font-mono uppercase" />
          <p className="text-xs text-muted-foreground mt-1">Must be unique within this blueprint + term.</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="delivery_format">
            Delivery Format <span className="text-rose-500">*</span>
          </label>
          <select id="delivery_format" name="delivery_format" required
            value={format} onChange={(e) => setFormat(e.target.value)}
            className="input w-full">
            {FORMATS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      {/* Enrollment type */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="enrollment_type">
          Enrollment Type <span className="text-rose-500">*</span>
        </label>
        <select id="enrollment_type" name="enrollment_type" defaultValue="open" className="input w-full">
          {ENROLLMENT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Enrollment limits */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="max_enrollment">
          Max Enrollment
        </label>
        <input id="max_enrollment" name="max_enrollment" type="number" min="1"
          placeholder="Unlimited" className="input w-48" />
      </div>

      {/* Enrollment open/close */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="enrollment_open_date">
            Enrollment Opens
          </label>
          <input id="enrollment_open_date" name="enrollment_open_date"
            type="datetime-local" className="input w-full" />
        </div>
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="enrollment_close_date">
            Enrollment Closes
          </label>
          <input id="enrollment_close_date" name="enrollment_close_date"
            type="datetime-local" className="input w-full" />
        </div>
      </div>

      {/* Access window — shown for all but self_paced */}
      {needsWindow && (
        <div className="border border-border rounded-xl p-5 space-y-4 bg-slate-50">
          <p className="text-sm font-bold text-foreground">Access Window</p>
          <p className="text-xs text-muted-foreground -mt-2">
            Content is only accessible within this window. This is the security boundary — required for {format} delivery.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="window_start">
                Window Opens
              </label>
              <input id="window_start" name="window_start" type="datetime-local" className="input w-full" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="window_end">
                Window Closes
              </label>
              <input id="window_end" name="window_end" type="datetime-local" className="input w-full" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1" htmlFor="grace_days">
              Grace Period (days after close)
            </label>
            <input id="grace_days" name="grace_days" type="number" min="0"
              defaultValue="0" className="input w-24" />
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={pending}
          className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
          {pending ? 'Creating…' : 'Create Section'}
        </button>
        <Link href="/admin/sections"
          className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-border hover:bg-slate-50 transition-colors text-muted-foreground">
          Cancel
        </Link>
      </div>
    </form>
  )
}
