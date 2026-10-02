'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('adminBlueprints')
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
    <div className="space-y-8 text-slate-100">
      <form onSubmit={handleSubmit} className="space-y-5">
        {managedSource && (
          <div className="flex items-center gap-2 rounded-md border border-sky-800 bg-sky-950/50 px-3 py-2 text-sm font-semibold text-sky-300">
            <Database className="h-4 w-4" aria-hidden="true" />
            {t('oneRosterManaged')}
          </div>
        )}
        {error && <div className="bg-rose-950/40 border border-rose-800 rounded-xl p-3 text-rose-300 text-sm leading-relaxed">{error}</div>}
        {ok    && <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-emerald-300 text-sm font-medium">{t('savedSuccess')}</div>}

        {mode === 'create' && (
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="course_code">
              {t('courseCode')} <span className="text-rose-400">*</span>
            </label>
            <input id="course_code" name="course_code" required
              placeholder="e.g. THEO-101" className="input w-full font-mono uppercase bg-slate-800 border-slate-700 text-white placeholder-slate-500" />
            <p className="text-xs text-slate-400 mt-1">{t('courseCodeHint')}</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="title">
            {t('title')} <span className="text-rose-400">*</span>
          </label>
          <input id="title" name="title" required defaultValue={initial?.title}
            placeholder={t('titlePlaceholder')} className="input w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500" readOnly={Boolean(managedSource)} />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="description">{t('description')}</label>
          <textarea id="description" name="description" rows={3}
            defaultValue={initial?.description ?? ''}
            placeholder={t('descriptionPlaceholder')} className="input w-full resize-none bg-slate-800 border-slate-700 text-white placeholder-slate-500" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="credits">{t('credits')}</label>
            <input id="credits" name="credits" type="number" step="0.25" min="0"
              defaultValue={initial?.credits ?? ''}
              placeholder={t('creditsPlaceholder')} className="input w-full bg-slate-800 border-slate-700 text-white placeholder-slate-500" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-200 mb-1.5" htmlFor="program_track_id">{t('programTrack')}</label>
            <select id="program_track_id" name="program_track_id"
              defaultValue={initial?.program_track_id ?? ''} className="input w-full bg-slate-800 border-slate-700 text-white">
              <option value="">{t('noTrack')}</option>
              {tracks.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
            </select>
          </div>
        </div>

        {mode === 'edit' && (
          <div className="flex items-center gap-2 pt-1">
            <input type="checkbox" id="is_active" name="is_active" value="true"
              defaultChecked={initial?.is_active} className="rounded bg-slate-800 border-slate-700 text-indigo-600" disabled={Boolean(managedSource)} />
            <label htmlFor="is_active" className="text-sm font-semibold text-slate-200 cursor-pointer">
              {t('active')} <span className="text-xs font-normal text-slate-400">{t('activeHint')}</span>
            </label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={pending || deleting}
            className="bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-indigo-500 transition-colors disabled:opacity-50">
            {pending ? t('btnSaving') : mode === 'create' ? t('btnCreate') : managedSource ? t('btnSaveLms') : t('btnSave')}
          </button>
          <Link href="/admin/blueprints"
            className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 transition-colors text-slate-300">
            {t('btnCancel')}
          </Link>
        </div>
      </form>

      {mode === 'edit' && !managedSource && (
        <div className="pt-6 border-t border-rose-900/50">
          <div className="rounded-xl border border-rose-800 bg-rose-950/30 p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-rose-400" />
                  {t('dangerZoneTitle')}
                </h3>
                <p className="text-xs text-rose-400/80 mt-1 max-w-md">
                  {t('dangerZoneDesc')}
                </p>
              </div>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-300 border border-rose-700 bg-rose-950/60 hover:bg-rose-900/60 px-3 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t('btnDelete')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={handleDelete}
                    className="bg-rose-600 text-white font-bold text-xs px-3 py-2 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? t('btnDeleting') : t('btnConfirmDelete')}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(false)}
                    className="bg-slate-800 border border-slate-700 text-slate-300 font-semibold text-xs px-3 py-2 rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    {t('btnCancel')}
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

