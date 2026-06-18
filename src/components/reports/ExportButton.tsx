'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Download, FileText, Loader2, Table2 } from 'lucide-react'

import { toast } from '@/hooks/use-toast'
import { useReportArtifactStatus } from '@/hooks/useReportArtifactStatus'

type ExportActionResult = {
  success: boolean
  artifactId?: string
  error?: string
  fileName?: string
  mimeType?: string
  base64?: string
}

type ExportButtonProps = {
  label: string
  action: () => Promise<ExportActionResult>
  format: 'pdf' | 'xlsx'
  onSyncComplete?: (base64: string) => void
}

type ExportState = 'idle' | 'submitting' | 'processing' | 'complete' | 'error'

function downloadBase64(base64: string, fileName: string, mimeType: string) {
  const byteCharacters = atob(base64)
  const byteNumbers = Array.from(byteCharacters, (character) => character.charCodeAt(0))
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function ExportButton({ label, action, format, onSyncComplete }: ExportButtonProps) {
  const [state, setState] = useState<ExportState>('idle')
  const [artifactId, setArtifactId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const inFlightRef = useRef(false)
  const artifactStatus = useReportArtifactStatus(artifactId)
  const disabled = state === 'submitting' || state === 'processing'
  const Icon = format === 'pdf' ? FileText : Table2

  useEffect(() => {
    if (state !== 'processing') return
    if (artifactStatus.status === 'complete') {
      setState('complete')
      setArtifactId(null)
      toast({ title: 'Report ready', description: 'Open Your Reports to download it.' })
      const timeout = window.setTimeout(() => setState('idle'), 3000)
      return () => window.clearTimeout(timeout)
    }

    if (artifactStatus.status === 'failed') {
      const message = artifactStatus.error ?? 'Report generation failed'
      setErrorMessage(message)
      setState('error')
      setArtifactId(null)
      toast({ title: 'Report failed', description: message, variant: 'destructive' })
      const timeout = window.setTimeout(() => setState('idle'), 5000)
      return () => window.clearTimeout(timeout)
    }
  }, [artifactStatus.error, artifactStatus.status, state])

  async function handleClick() {
    if (inFlightRef.current || disabled) return
    inFlightRef.current = true
    setState('submitting')
    setErrorMessage(null)

    try {
      const result = await action()
      if (!result.success) {
        throw new Error(result.error ?? 'Report export failed')
      }

      if (result.artifactId) {
        setArtifactId(result.artifactId)
        setState('processing')
        toast({ title: 'Report is processing', description: 'It will appear in Your Reports.' })
        return
      }

      if (result.base64) {
        onSyncComplete?.(result.base64)
        downloadBase64(
          result.base64,
          result.fileName ?? `churchcore-report.${format}`,
          result.mimeType ??
            (format === 'pdf'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        )
        setState('complete')
        toast({ title: 'Report downloaded' })
        window.setTimeout(() => setState('idle'), 3000)
        return
      }

      setState('complete')
      window.setTimeout(() => setState('idle'), 3000)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Report export failed'
      setErrorMessage(message)
      setState('error')
      toast({ title: 'Export failed', description: message, variant: 'destructive' })
      window.setTimeout(() => setState('idle'), 5000)
    } finally {
      inFlightRef.current = false
    }
  }

  const statusLabel =
    state === 'submitting'
      ? 'Preparing...'
      : state === 'processing'
        ? 'Processing... check Your Reports'
        : state === 'complete'
          ? 'Ready'
          : state === 'error'
            ? 'Try again'
            : label

  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-disabled={disabled}
        disabled={disabled}
        onClick={handleClick}
        className="inline-flex min-h-10 items-center justify-center gap-2 border border-slate-900 bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-500"
      >
        {state === 'submitting' || state === 'processing' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state === 'complete' ? (
          <Check className="h-4 w-4" aria-hidden="true" />
        ) : state === 'idle' ? (
          <Icon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        <span>{statusLabel}</span>
      </button>
      <p className="sr-only" aria-live="polite">
        {statusLabel}
      </p>
      {state === 'error' && errorMessage ? (
        <p className="mt-2 max-w-xs text-sm text-red-700">{errorMessage}</p>
      ) : null}
    </div>
  )
}
