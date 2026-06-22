'use client'

import { useState } from 'react'
import { upsertBadge, deleteBadge } from '@/app/actions/admin'

type TriggerType = 'none' | 'xp_threshold' | 'course_completion' | 'streak' | 'block_count'

interface Badge {
  id:                string
  title:             string
  description:       string
  is_auto_awarded:   boolean
  trigger_condition: Record<string, unknown> | null
}

interface FormState {
  id?:          string
  title:        string
  description:  string
  triggerType:  TriggerType
  threshold:    string
}

const TRIGGER_LABELS: Record<TriggerType, string> = {
  none:               'None (manual only)',
  xp_threshold:       'XP Threshold',
  course_completion:  'Course Completions',
  streak:             'Day Streak',
  block_count:        'Blocks Completed',
}

const TRIGGER_UNIT: Record<TriggerType, string> = {
  none:               '',
  xp_threshold:       'XP',
  course_completion:  'courses',
  streak:             'days',
  block_count:        'blocks',
}

function buildCondition(triggerType: TriggerType, threshold: string): Record<string, unknown> | null {
  if (triggerType === 'none') return null
  const n = parseInt(threshold, 10)
  if (isNaN(n) || n <= 0) return null
  if (triggerType === 'xp_threshold')      return { type: 'xp_threshold',      threshold: n }
  if (triggerType === 'course_completion') return { type: 'course_completion',  count: n }
  if (triggerType === 'streak')            return { type: 'streak',             days: n }
  if (triggerType === 'block_count')       return { type: 'block_count',        count: n }
  return null
}

function parseTrigger(cond: Record<string, unknown> | null): { triggerType: TriggerType; threshold: string } {
  if (!cond) return { triggerType: 'none', threshold: '' }
  const t = cond.type as TriggerType
  const val = (cond.threshold ?? cond.count ?? cond.days ?? '') as number | string
  return { triggerType: t ?? 'none', threshold: String(val) }
}

const EMPTY_FORM: FormState = { title: '', description: '', triggerType: 'none', threshold: '' }

export default function BadgesAdminClient({ initialBadges }: { initialBadges: Badge[] }) {
  const [badges,  setBadges]  = useState<Badge[]>(initialBadges)
  const [form,    setForm]    = useState<FormState | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function openCreate() {
    setForm(EMPTY_FORM)
    setError(null)
  }

  function openEdit(b: Badge) {
    const { triggerType, threshold } = parseTrigger(b.trigger_condition)
    setForm({ id: b.id, title: b.title, description: b.description, triggerType, threshold })
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form || !form.title.trim()) return
    setSaving(true)
    setError(null)

    const triggerCondition = buildCondition(form.triggerType, form.threshold)
    const result = await upsertBadge({
      id:               form.id,
      title:            form.title,
      description:      form.description,
      triggerCondition,
    })

    setSaving(false)
    if (result.error) { setError(result.error); return }

    // Refresh list optimistically
    if (form.id) {
      setBadges((prev) => prev.map((b) => b.id === form.id ? {
        ...b, title: form.title, description: form.description,
        trigger_condition: triggerCondition, is_auto_awarded: triggerCondition !== null,
      } : b))
    } else if (result.id) {
      setBadges((prev) => [...prev, {
        id: result.id!, title: form.title, description: form.description,
        trigger_condition: triggerCondition, is_auto_awarded: triggerCondition !== null,
      }])
    }
    setForm(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this badge? All awarded records will also be removed.')) return
    const result = await deleteBadge(id)
    if (result.error) { setError(result.error); return }
    setBadges((prev) => prev.filter((b) => b.id !== id))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">{badges.length} badge{badges.length !== 1 ? 's' : ''}</p>
        <button
          type="button"
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors"
        >
          + New Badge
        </button>
      </div>

      {/* Form panel */}
      {form && (
        <div className="bg-white border border-border rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="font-extrabold text-foreground mb-4">{form.id ? 'Edit Badge' : 'Create Badge'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => f && { ...f, title: e.target.value })}
                placeholder="e.g. First Steps"
                className="input w-full"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })}
                placeholder="What this badge represents…"
                rows={2}
                className="input w-full resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1">Auto-award Trigger</label>
              <select
                value={form.triggerType}
                onChange={(e) => setForm((f) => f && { ...f, triggerType: e.target.value as TriggerType, threshold: '' })}
                className="input w-full"
                title="Trigger type"
              >
                {(Object.keys(TRIGGER_LABELS) as TriggerType[]).map((k) => (
                  <option key={k} value={k}>{TRIGGER_LABELS[k]}</option>
                ))}
              </select>
            </div>

            {form.triggerType !== 'none' && (
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1">
                  Threshold ({TRIGGER_UNIT[form.triggerType]})
                </label>
                <input
                  type="number"
                  min="1"
                  value={form.threshold}
                  onChange={(e) => setForm((f) => f && { ...f, threshold: e.target.value })}
                  placeholder={`e.g. ${form.triggerType === 'xp_threshold' ? '100' : '1'}`}
                  className="input w-32"
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-rose-600 font-medium">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Badge'}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Badge list */}
      {badges.length === 0 ? (
        <div className="bg-white border border-border rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">🏅</p>
          <p className="text-muted-foreground italic mb-4">No badges yet.</p>
          <button type="button" onClick={openCreate}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-bold px-5 py-2 rounded-xl text-sm hover:bg-primary/90 transition-colors"
          >
            Create your first badge →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {badges.map((b) => {
            const { triggerType, threshold } = parseTrigger(b.trigger_condition)
            return (
              <div key={b.id} className="bg-white border border-border rounded-xl p-5 flex items-start gap-4">
                <div className="text-2xl shrink-0">🏅</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-foreground">{b.title}</p>
                    {b.is_auto_awarded && (
                      <span className="text-[10px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                        Auto
                      </span>
                    )}
                  </div>
                  {b.description && <p className="text-sm text-muted-foreground mt-0.5">{b.description}</p>}
                  {triggerType !== 'none' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Trigger: {TRIGGER_LABELS[triggerType]} ≥ {threshold} {TRIGGER_UNIT[triggerType]}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => openEdit(b)}
                    className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">
                    Edit
                  </button>
                  <button type="button" onClick={() => handleDelete(b.id)}
                    className="text-xs font-semibold text-rose-400 hover:text-rose-600 transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
