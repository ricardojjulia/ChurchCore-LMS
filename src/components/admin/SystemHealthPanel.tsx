'use client'

import { useState } from 'react'
import type { SystemHealthCheck, HealthStatus, HealthCheckResponse } from '@/types/health'

const STATUS_ICON: Record<HealthStatus, string> = {
  ok:      '✅',
  warning: '⚠️',
  error:   '❌',
  unknown: '❓',
}

const STATUS_STYLES: Record<HealthStatus, string> = {
  ok:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error:   'bg-rose-50 text-rose-700 border-rose-200',
  unknown: 'bg-slate-50 text-slate-600 border-slate-200',
}

const STATUS_DOT: Record<HealthStatus, string> = {
  ok:      'bg-emerald-500',
  warning: 'bg-amber-400',
  error:   'bg-rose-500',
  unknown: 'bg-slate-400',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function CheckRow({ check }: { check: SystemHealthCheck }) {
  const [expanded, setExpanded] = useState(false)
  const hasMetadata = Object.keys(check.metadata ?? {}).length > 0

  return (
    <div className={`border rounded-xl px-4 py-3 ${STATUS_STYLES[check.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden="true">{STATUS_ICON[check.status]}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold font-mono truncate">{check.check_name}</p>
            {check.message && (
              <p className="text-xs mt-0.5 opacity-80">{check.message}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs opacity-60 whitespace-nowrap">
            {relativeTime(check.last_checked)}
          </span>
          {check.action_url && (
            <a
              href={check.action_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              view →
            </a>
          )}
          {hasMetadata && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              {expanded ? 'hide' : 'details'}
            </button>
          )}
        </div>
      </div>
      {expanded && hasMetadata && (
        <pre className="mt-2 text-xs bg-white/50 rounded-lg p-2 overflow-auto max-h-32 border border-current/10">
          {JSON.stringify(check.metadata, null, 2)}
        </pre>
      )}
    </div>
  )
}

type PanelState = 'idle' | 'loading' | 'success' | 'error' | 'not_found'

interface Props {
  initialChecks?: SystemHealthCheck[]
}

export default function SystemHealthPanel({ initialChecks = [] }: Props) {
  const [checks, setChecks]       = useState<SystemHealthCheck[]>(initialChecks)
  const [panelState, setPanelState] = useState<PanelState>('idle')
  const [errorMsg, setErrorMsg]   = useState<string | null>(null)
  const [lastRan, setLastRan]     = useState<string | null>(null)

  // Derive latest check per check_name
  const latestByName = Object.values(
    checks.reduce<Record<string, SystemHealthCheck>>((acc, c) => {
      if (!acc[c.check_name] || c.last_checked > acc[c.check_name].last_checked) {
        acc[c.check_name] = c
      }
      return acc
    }, {}),
  ).sort((a, b) => a.check_name.localeCompare(b.check_name))

  const overallStatus: HealthStatus = latestByName.some((c) => c.status === 'error')
    ? 'error'
    : latestByName.some((c) => c.status === 'warning')
      ? 'warning'
      : latestByName.length === 0
        ? 'unknown'
        : 'ok'

  async function runChecks() {
    setPanelState('loading')
    setErrorMsg(null)

    try {
      const res = await fetch('/api/health', { method: 'POST' })

      if (res.status === 404) {
        setPanelState('not_found')
        return
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg(body.error ?? `Unexpected error (${res.status})`)
        setPanelState('error')
        return
      }

      const data = (await res.json()) as HealthCheckResponse
      setChecks(data.checks)
      setLastRan(data.timestamp)
      setPanelState('success')
    } catch (e) {
      setErrorMsg(String(e))
      setPanelState('error')
    }
  }

  const isLoading = panelState === 'loading'

  const statusLabel =
    panelState === 'loading' ? 'Running checks…'
    : panelState === 'success' ? 'Checks complete'
    : overallStatus === 'unknown' ? 'No checks yet'
    : overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)

  const lastCheckedLabel = lastRan
    ? `Last checked ${relativeTime(lastRan)}`
    : latestByName[0]
      ? `Last checked ${relativeTime(latestByName[0].last_checked)}`
      : null

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${STATUS_DOT[overallStatus]}`} />
          <span className="text-sm font-semibold text-slate-700">{statusLabel}</span>
          {lastCheckedLabel && !isLoading && (
            <span className="text-xs text-muted-foreground">{lastCheckedLabel}</span>
          )}
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={isLoading}
          className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-primary rounded-lg px-4 py-1.5 hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isLoading && (
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          )}
          {isLoading ? 'Running…' : 'Run Checks'}
        </button>
      </div>

      {/* Error states */}
      {panelState === 'not_found' && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          Health check endpoint not found. Contact your system administrator.
        </div>
      )}
      {panelState === 'error' && errorMsg && (
        <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
          Health check failed. Try again or check Edge Function logs.
          <span className="block mt-1 text-xs opacity-70">{errorMsg}</span>
        </div>
      )}

      {/* Check rows — previous results stay visible while loading */}
      {latestByName.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-8">
          No checks have run yet. Click "Run Checks" to start.
        </p>
      ) : (
        <div className="space-y-2">
          {latestByName.map((c) => <CheckRow key={c.check_name} check={c} />)}
        </div>
      )}
    </div>
  )
}
