import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Database, Trash2, AlertTriangle } from 'lucide-react'
import { createBlueprint, updateBlueprint, deleteBlueprint } from '@/app/actions/academic'

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
  managedSource?: string | null
}

export default function BlueprintForm({ mode, blueprintId, initial, tracks, managedSource }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [ok,    setOk]    = useState(false)
  const [pending, start]  = useTransition()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, startDelete] = useTransition()

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

  function handleDelete() {
    if (!blueprintId) return
    setError(null)
    startDelete(async () => {
      const res = await deleteBlueprint(blueprintId)
      if (res?.error) {
        setError(res.error)
        setConfirmDelete(false)
      } else {
        router.push('/admin/blueprints')
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        {managedSource && (
          <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800">
            <Database className="h-4 w-4" aria-hidden="true" />
            OneRoster managed
          </div>
        )}
        {error && <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-sm leading-relaxed">{error}</div>}
        {ok    && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800 text-sm font-medium">Saved changes successfully.</div>}

        {mode === 'create' && (
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="course_code">
              Course Code <span className="text-rose-700">*</span>
            </label>
            <input id="course_code" name="course_code" required
              placeholder="e.g. THEO-101" className="input w-full font-mono uppercase" />
            <p className="text-xs text-muted-foreground mt-1">Unique, auto-uppercased, immutable after creation.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="title">
            Title <span className="text-rose-700">*</span>
          </label>
          <input id="title" name="title" required defaultValue={initial?.title}
            placeholder="e.g. Introduction to Theology" className="input w-full" readOnly={Boolean(managedSource)} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1.5" htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={3}
            defaultValue={initial?.description ?? ''}
            placeholder="Optional course description" className="input w-full resize-none" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="is_active" name="is_active" value="true"
              defaultChecked={initial?.is_active} className="rounded" disabled={Boolean(managedSource)} />
            <label htmlFor="is_active" className="text-sm font-semibold text-foreground cursor-pointer">
              Active <span className="text-xs font-normal text-muted-foreground">(Uncheck to archive from new course selectors)</span>
            </label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={pending || deleting}
            className="bg-primary text-primary-foreground font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-primary/90 transition-colors disabled:opacity-50">
            {pending ? 'Saving…' : mode === 'create' ? 'Create Blueprint' : managedSource ? 'Save LMS Settings' : 'Save Changes'}
          </button>
          <Link href="/admin/blueprints"
            className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-border hover:bg-slate-50 transition-colors text-muted-foreground">
            Cancel
          </Link>
        </div>
      </form>

      {mode === 'edit' && !managedSource && (
        <div className="pt-6 border-t border-rose-100">
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  Danger Zone
                </h3>
                <p className="text-xs text-rose-700 mt-1 max-w-md">
                  Permanently remove this blueprint. Cannot be undone. Blueprints with active sections or attached courses must be archived instead.
                </p>
              </div>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 border border-rose-300 bg-white hover:bg-rose-50 px-3 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Blueprint
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="bg-rose-600 text-white font-bold text-xs px-3 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting…' : 'Confirm Delete'}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="bg-white border border-slate-300 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

