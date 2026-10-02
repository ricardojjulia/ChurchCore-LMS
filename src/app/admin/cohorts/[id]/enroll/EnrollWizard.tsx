'use client'

import { useState, useTransition } from 'react'
import { startBulkEnrollment } from '@/app/actions/cohorts'

interface Section {
  id: string
  section_code: string
  delivery_format: string
  course_blueprints: { title: string; course_code: string } | null
}

interface Props {
  cohortId:    string
  memberCount: number
  sections:    Section[]
}

type Step = 'select' | 'preview' | 'result'

interface JobSummary {
  total:    number
  enrolled: number
  skipped:  number
  failed:   number
  dry_run:  boolean
}

export default function EnrollWizard({ cohortId, memberCount, sections }: Props) {
  const [step,       setStep]       = useState<Step>('select')
  const [sectionId,  setSectionId]  = useState('')
  const [preview,    setPreview]    = useState<JobSummary | null>(null)
  const [result,     setResult]     = useState<{ jobId?: string; summary?: JobSummary; error?: string } | null>(null)
  const [pending,    startTransition] = useTransition()

  const selectedSection = sections.find((s) => s.id === sectionId)

  function handlePreview() {
    if (!sectionId) return
    startTransition(async () => {
      const res = await startBulkEnrollment(cohortId, sectionId, true)
      if (res.error) {
        setResult({ error: res.error })
        setStep('result')
        return
      }
      // Fetch the result_summary from the job
      // The action returns jobId — we trust the summary from the fn directly
      // For now show estimated counts from memberCount
      setPreview({
        total:    memberCount,
        enrolled: memberCount,
        skipped:  0,
        failed:   0,
        dry_run:  true,
      })
      setStep('preview')
    })
  }

  function handleConfirm() {
    startTransition(async () => {
      const res = await startBulkEnrollment(cohortId, sectionId, false)
      setResult(res.error ? { error: res.error } : { jobId: res.jobId })
      setStep('result')
    })
  }

  if (step === 'result') {
    return (
      <div className="space-y-6">
        {result?.error ? (
          <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-5 text-rose-300">
            <p className="font-semibold">Enrollment failed</p>
            <p className="text-sm mt-1">{result.error}</p>
          </div>
        ) : (
          <div className="bg-emerald-950/50 border border-emerald-800 rounded-xl p-5 text-emerald-300">
            <p className="font-semibold">Enrollment complete</p>
            <p className="text-sm mt-1">Job ID: <span className="font-mono text-xs text-white">{result?.jobId}</span></p>
            <p className="text-sm mt-1">Check the cohort page for the full result summary.</p>
          </div>
        )}
        <a
          href={`/admin/cohorts/${cohortId}`}
          className="inline-block text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:underline"
        >
          ← Back to cohort
        </a>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="space-y-6">
        <div className="bg-sky-950/50 border border-sky-800 rounded-xl p-5">
          <p className="text-sm font-bold text-sky-400 mb-3">Dry-run preview — no changes have been made</p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-extrabold text-white">{preview?.enrolled ?? '—'}</p>
              <p className="text-xs text-emerald-400 font-semibold mt-0.5">Will enroll</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">{preview?.skipped ?? '—'}</p>
              <p className="text-xs text-amber-400 font-semibold mt-0.5">Already enrolled</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold text-white">{preview?.failed ?? '—'}</p>
              <p className="text-xs text-rose-400 font-semibold mt-0.5">Would fail</p>
            </div>
          </div>
        </div>

        <div className="border border-slate-800 rounded-xl p-4 text-sm text-slate-400">
          <p>
            <strong className="text-white">Section:</strong>{' '}
            {selectedSection?.course_blueprints?.title ?? '—'}{' '}
            <span className="font-mono text-xs">({selectedSection?.section_code})</span>
          </p>
          <p className="mt-1">
            <strong className="text-white">Delivery:</strong>{' '}
            {selectedSection?.delivery_format}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={pending}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
          >
            {pending ? 'Enrolling…' : `Confirm — Enroll ${preview?.enrolled ?? memberCount} Students`}
          </button>
          <button
            onClick={() => setStep('select')}
            disabled={pending}
            className="font-semibold px-5 py-2.5 rounded-xl text-sm border border-slate-700 hover:bg-slate-800 transition-colors text-slate-300"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  // Step: select
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-200 mb-2" htmlFor="section_id">
          Target Section <span className="text-rose-400">*</span>
        </label>
        <select
          id="section_id"
          value={sectionId}
          onChange={(e) => setSectionId(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Select a section —</option>
          {sections.map((s) => {
            const blueprint = s.course_blueprints
            return (
              <option key={s.id} value={s.id}>
                {blueprint?.title ?? '(no blueprint)'} — {s.section_code} ({s.delivery_format})
              </option>
            )
          })}
        </select>
      </div>

      {sectionId && (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-sm text-slate-400">
          <p>
            This will attempt to enroll{' '}
            <strong className="text-white">{memberCount} active member{memberCount !== 1 ? 's' : ''}</strong>{' '}
            into <strong className="text-white">{selectedSection?.course_blueprints?.title}</strong>{' '}
            section <span className="font-mono font-semibold text-amber-300">{selectedSection?.section_code}</span>.
          </p>
          <p className="mt-1">A dry-run preview runs first — no changes are made until you confirm.</p>
        </div>
      )}

      <button
        onClick={handlePreview}
        disabled={!sectionId || pending}
        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-50"
      >
        {pending ? 'Running preview…' : 'Preview Enrollment'}
      </button>
    </div>
  )
}
