'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Trash2,
  X,
} from 'lucide-react'

import { clearCompletedReportArtifacts } from '@/app/(reports)/reports-drawer-actions'
import { toast } from '@/hooks/use-toast'
import { useReportsDrawer } from '@/hooks/useReportsDrawer'
import type { GenerationStatus, ReportArtifact, ReportFormat, ReportType } from '@/types/reporting'

function formatRelativeTime(value: string): string {
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.round(diffMs / 60000))
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function dateGroup(value: string): 'Today' | 'This Week' | 'Older' {
  const generatedAt = new Date(value)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay())

  if (generatedAt >= startOfToday) return 'Today'
  if (generatedAt >= startOfWeek) return 'This Week'
  return 'Older'
}

function statusClass(status: GenerationStatus): string {
  if (status === 'complete') return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  if (status === 'failed') return 'bg-red-50 text-red-700 ring-red-200'
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

function reportType(artifact: ReportArtifact): ReportType {
  if (artifact.format === 'xlsx') return 'gradebook'
  return 'completion'
}

function formatLabel(format: ReportFormat): string {
  return format.toUpperCase()
}

async function downloadArtifact(artifact: ReportArtifact) {
  const response = await fetch(`/api/reports/artifacts/${artifact.id}/signed-url`, {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Unable to create download link')
  const payload = (await response.json()) as { signedUrl: string }
  window.open(payload.signedUrl, '_blank', 'noopener,noreferrer')
}

function ArtifactRow({ artifact }: { artifact: ReportArtifact }) {
  const type = reportType(artifact)
  const Icon = artifact.format === 'xlsx' ? FileSpreadsheet : FileText
  const name = type === 'gradebook' ? 'Gradebook export' : 'Progress report'

  return (
    <li className="border-b border-slate-200 py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 items-center justify-center bg-slate-100 text-slate-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-slate-950">{name}</p>
            <span className="ring-1 ring-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {formatLabel(artifact.format)}
            </span>
            <span className={`ring-1 px-2 py-0.5 text-xs font-semibold ${statusClass(artifact.generation_status)}`}>
              {artifact.generation_status}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatRelativeTime(artifact.generated_at)}</p>
          {artifact.generation_status === 'failed' && artifact.error_message ? (
            <p className="mt-2 line-clamp-2 text-xs text-red-700">{artifact.error_message}</p>
          ) : null}
        </div>
        <div className="shrink-0">
          {artifact.generation_status === 'complete' ? (
            <button
              type="button"
              onClick={() => {
                void downloadArtifact(artifact).catch((error) => {
                  toast({
                    title: 'Download failed',
                    description: error instanceof Error ? error.message : 'Unable to download report',
                    variant: 'destructive',
                  })
                })
              }}
              className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Download
            </button>
          ) : artifact.generation_status === 'failed' ? (
            <AlertCircle className="h-5 w-5 text-red-600" aria-label="Failed" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" aria-label="Processing" />
          )}
        </div>
      </div>
    </li>
  )
}

export default function ReportsDrawer() {
  const { artifacts, isLoading, isOpen, openDrawer, closeDrawer, refresh } = useReportsDrawer()
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const grouped = useMemo(() => {
    return artifacts.reduce<Record<'Today' | 'This Week' | 'Older', ReportArtifact[]>>(
      (groups, artifact) => {
        groups[dateGroup(artifact.generated_at)].push(artifact)
        return groups
      },
      { Today: [], 'This Week': [], Older: [] }
    )
  }, [artifacts])

  useEffect(() => {
    if (!isOpen) return
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDrawer()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeDrawer, isOpen])

  return (
    <>
      <button
        type="button"
        onClick={openDrawer}
        className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Your Reports
      </button>

      <div
        className={`fixed inset-0 z-50 transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!isOpen}
      >
        <button
          type="button"
          aria-label="Close reports drawer overlay"
          onClick={closeDrawer}
          className={`absolute inset-0 bg-slate-950/40 transition-opacity ${
            isOpen ? 'opacity-100' : 'opacity-0'
          }`}
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="reports-drawer-title"
          className={`absolute right-0 top-0 flex h-full w-full max-w-xl transform flex-col bg-white shadow-2xl transition-transform duration-300 ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 id="reports-drawer-title" className="text-lg font-bold text-slate-950">
                Your Reports
              </h2>
              <p className="text-sm text-slate-600">Generated exports and long-running report jobs.</p>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              className="p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close reports drawer</span>
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <button
              type="button"
              onClick={() => void refresh()}
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={async () => {
                const result = await clearCompletedReportArtifacts()
                if (!result.success) {
                  toast({ title: 'Unable to clear reports', description: result.error, variant: 'destructive' })
                  return
                }
                toast({ title: 'Completed reports cleared', description: `${result.deletedCount} removed.` })
                await refresh()
              }}
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Clear completed
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            {isLoading ? (
              <div className="flex items-center gap-3 py-10 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading reports
              </div>
            ) : artifacts.length === 0 ? (
              <p className="py-10 text-sm text-slate-600">No report exports yet.</p>
            ) : (
              (['Today', 'This Week', 'Older'] as const).map((group) =>
                grouped[group].length > 0 ? (
                  <section key={group} className="py-4" aria-labelledby={`reports-${group}`}>
                    <h3 id={`reports-${group}`} className="text-xs font-bold uppercase tracking-wide text-slate-500">
                      {group}
                    </h3>
                    <ul className="mt-2">
                      {grouped[group].map((artifact) => (
                        <ArtifactRow key={artifact.id} artifact={artifact} />
                      ))}
                    </ul>
                  </section>
                ) : null
              )
            )}
          </div>
        </div>
      </div>
    </>
  )
}
