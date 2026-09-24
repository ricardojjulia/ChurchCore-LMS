'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Eye, FileArchive, History, Link2, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PreviewFile {
  totalRows: number
  validRows: number
  quarantinedRows: number
}

interface PreviewResult {
  jobId: string
  valid: boolean
  preview: {
    totalRows: number
    validRows: number
    quarantinedRows: number
    byFile: Record<string, PreviewFile>
  }
  diff: OneRosterCounts
  issues: Array<{
    severity: 'error' | 'warning'
    code: string
    message: string
    fileType?: string
    rowNumber?: number
    sourcedIdHash?: string
  }>
}

type Step = 'upload' | 'preview'

interface ApplyResult {
  success: boolean
  status: string
  created: number
  updated: number
  unchanged: number
  deactivated: number
  quarantined: number
}

interface OneRosterCounts {
  created: number
  updated: number
  unchanged: number
  deactivated: number
  quarantined: number
}

interface IdentityLinksResult {
  users: Array<{
    sourcedId: string | null
    status: string | null
    enabledUser: string | null
    operation: string
    rowStatus: string
    errorCode: string | null
    errorMessage: string | null
    linkedProfileUid: string | null
    sourceStatus: string | null
  }>
  profiles: Array<{
    uid: string
    display_name: string
    email: string
    student_id: string | null
    role: string
    status: string
  }>
}

interface ImportJob extends OneRosterCounts {
  id: string
  connection_id: string | null
  source_system: string
  status: string
  total_rows: number
  error_count: number
  created_at: string
  completed_at: string | null
}

export function OneRosterImportClient() {
  const [step, setStep] = useState<Step>('upload')
  const [result, setResult] = useState<PreviewResult | null>(null)
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [history, setHistory] = useState<ImportJob[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [identityLinks, setIdentityLinks] = useState<IdentityLinksResult | null>(null)
  const [identityLoading, setIdentityLoading] = useState(false)
  const [identitySelections, setIdentitySelections] = useState<Record<string, string>>({})
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null)
  const [reviewingJobId, setReviewingJobId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations/oneroster/jobs')
      const body = await response.json()
      if (response.ok) setHistory(body.jobs as ImportJob[])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  function reset() {
    setStep('upload')
    setResult(null)
    setApplyResult(null)
    setError(null)
    setUploading(false)
    setApplying(false)
    setIdentityLinks(null)
    setIdentitySelections({})
    setLinkingSourceId(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || uploading) return

    setUploading(true)
    setError(null)
    setResult(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/integrations/oneroster/validate', {
        method: 'POST',
        body: formData,
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error ?? 'Unable to validate package')
        setStep('upload')
        return
      }
      setResult(body as PreviewResult)
      await loadIdentityLinks(body.jobId)
      setStep('preview')
    } catch {
      setError('Unable to validate package')
      setStep('upload')
    } finally {
      setUploading(false)
    }
  }

  async function loadIdentityLinks(jobId: string) {
    setIdentityLoading(true)
    try {
      const response = await fetch(`/api/integrations/oneroster/jobs/${jobId}/identity-links`)
      if (!response.ok) return
      const body = await response.json() as IdentityLinksResult
      setIdentityLinks(body)
      setIdentitySelections((current) => Object.fromEntries(
        body.users
          .filter((user) => user.sourcedId && user.linkedProfileUid)
          .map((user) => [user.sourcedId as string, user.linkedProfileUid as string])
          .concat(Object.entries(current)),
      ))
    } finally {
      setIdentityLoading(false)
    }
  }

  async function handleLink(sourcedId: string) {
    const profileUid = identitySelections[sourcedId]
    if (!profileUid || linkingSourceId) return
    setLinkingSourceId(sourcedId)
    setError(null)
    try {
      const response = await fetch(`/api/integrations/oneroster/jobs/${result?.jobId}/identity-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcedId, profileUid }),
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error ?? 'Unable to save identity link')
        return
      }
      if (body.preview && result) setResult({ ...result, diff: body.preview as OneRosterCounts })
      if (result) await loadIdentityLinks(result.jobId)
    } catch {
      setError('Unable to save identity link')
    } finally {
      setLinkingSourceId(null)
    }
  }

  async function handleApply() {
    if (!result?.valid || applying) return
    setApplying(true)
    setError(null)

    try {
      const response = await fetch(`/api/integrations/oneroster/jobs/${result.jobId}/apply`, {
        method: 'POST',
      })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error ?? 'Unable to apply import')
        return
      }
      setApplyResult(body as ApplyResult)
      void loadHistory()
    } catch {
      setError('Unable to apply import')
    } finally {
      setApplying(false)
    }
  }

  async function handleReviewJob(jobId: string) {
    if (reviewingJobId) return
    setReviewingJobId(jobId)
    setError(null)
    setApplyResult(null)
    try {
      const response = await fetch(`/api/integrations/oneroster/jobs/${jobId}/preview`, { method: 'POST' })
      const body = await response.json()
      if (!response.ok) {
        setError(body.error ?? 'Unable to prepare import review')
        return
      }
      setResult(body as PreviewResult)
      await loadIdentityLinks(jobId)
      setStep('preview')
    } catch {
      setError('Unable to prepare import review')
    } finally {
      setReviewingJobId(null)
    }
  }

  if (step === 'preview' && result) {
    const files = Object.entries(result.preview.byFile)
    const errors = result.issues.filter((issue) => issue.severity === 'error')
    const warnings = result.issues.filter((issue) => issue.severity === 'warning')
    const identityReady = !identityLoading && identityLinks !== null && identityLinks.users.every((user) => user.linkedProfileUid)

    return (
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {applyResult && (
          <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${applyResult.status === 'applied' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            {applyResult.status === 'applied' ? 'Import completed.' : 'Import completed with quarantined rows.'} {applyResult.created} created, {applyResult.updated} updated, {applyResult.unchanged} unchanged, {applyResult.deactivated} deactivated, {applyResult.quarantined} quarantined.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Total Rows" value={result.preview.totalRows} />
          <SummaryCard label="Ready" value={result.preview.validRows} tone="success" />
          <SummaryCard label="Quarantined" value={result.preview.quarantinedRows} tone={result.preview.quarantinedRows ? 'danger' : 'neutral'} />
        </div>

        <section aria-labelledby="planned-changes-heading">
          <h2 id="planned-changes-heading" className="mb-3 text-sm font-semibold text-foreground">Planned changes</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <SummaryCard label="Create" value={result.diff.created} tone="success" />
            <SummaryCard label="Update" value={result.diff.updated} />
            <SummaryCard label="Unchanged" value={result.diff.unchanged} />
            <SummaryCard label="Deactivate" value={result.diff.deactivated} tone={result.diff.deactivated ? 'danger' : 'neutral'} />
            <SummaryCard label="Quarantine" value={result.diff.quarantined} tone={result.diff.quarantined ? 'danger' : 'neutral'} />
          </div>
        </section>

        <div className="rounded-lg border border-border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">File</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Rows</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Ready</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Quarantine</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map(([fileType, file]) => (
                <tr key={fileType}>
                  <td className="px-4 py-3 font-medium text-foreground">{fileType}.csv</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{file.totalRows}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{file.validRows}</td>
                  <td className="px-4 py-3 text-right text-rose-700">{file.quarantinedRows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-white p-4">
          <div className="flex items-center gap-2">
            {result.valid ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600" aria-hidden="true" />
            )}
            <h2 className="text-sm font-semibold text-foreground">
              {result.valid ? 'Package Passed Validation' : 'Package Needs Review'}
            </h2>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">
              {errors.length} errors
            </Badge>
            <Badge className="border-amber-200 bg-amber-50 text-amber-700">
              {warnings.length} warnings
            </Badge>
          </div>

          {result.issues.length > 0 && (
            <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Level</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">File</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Row</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Issue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {result.issues.map((issue, index) => (
                    <tr key={`${issue.code}-${index}`}>
                      <td className="px-3 py-2 uppercase text-muted-foreground">{issue.severity}</td>
                      <td className="px-3 py-2">{issue.fileType ?? '-'}</td>
                      <td className="px-3 py-2">{issue.rowNumber ?? '-'}</td>
                      <td className="px-3 py-2">{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {identityLinks?.users.length ? (
          <IdentityLinkPanel
            identityLinks={identityLinks}
            selections={identitySelections}
            onSelect={(sourcedId, profileUid) => setIdentitySelections((current) => ({ ...current, [sourcedId]: profileUid }))}
            onLink={handleLink}
            linkingSourceId={linkingSourceId}
          />
        ) : null}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={reset} disabled={applying}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button
            disabled={!result.valid || applying || !!applyResult || !identityReady}
            onClick={handleApply}
            title={!result.valid ? 'Resolve validation errors before applying' : !identityReady ? 'Link every roster user before applying' : undefined}
          >
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
            {applying ? 'Applying...' : 'Apply Import'}
          </Button>
        </div>
        <ImportHistory jobs={history} loading={historyLoading} reviewingJobId={reviewingJobId} onReview={handleReviewJob} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-border bg-white p-8">
        <label
          htmlFor="oneroster-file"
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-200 px-6 py-12 text-center transition-colors hover:border-slate-300 hover:bg-slate-50"
        >
          <FileArchive className="h-10 w-10 text-slate-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              {uploading ? 'Validating package...' : 'Choose OneRoster ZIP package'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">10 MB maximum</p>
          </div>
          <input
            ref={fileRef}
            id="oneroster-file"
            type="file"
            accept=".zip,application/zip"
            disabled={uploading}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Users must be linked to existing LMS profiles before identity data can apply. Unsupported roles and unresolved references remain quarantined.
      </div>
      <ImportHistory jobs={history} loading={historyLoading} reviewingJobId={reviewingJobId} onReview={handleReviewJob} />
    </div>
  )
}

function IdentityLinkPanel({
  identityLinks,
  selections,
  onSelect,
  onLink,
  linkingSourceId,
}: {
  identityLinks: IdentityLinksResult
  selections: Record<string, string>
  onSelect: (sourcedId: string, profileUid: string) => void
  onLink: (sourcedId: string) => void
  linkingSourceId: string | null
}) {
  return (
    <section aria-labelledby="identity-links-heading" className="rounded-lg border border-border bg-white p-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="identity-links-heading" className="text-sm font-semibold text-foreground">Link roster users</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Choose an existing LMS profile for each roster sourcedId. Auth accounts are never created from an import.</p>
      <div className="mt-4 space-y-3">
        {identityLinks.users.map((user) => {
          if (!user.sourcedId) return null
          const selected = selections[user.sourcedId] ?? user.linkedProfileUid ?? ''
          const linked = Boolean(user.linkedProfileUid)
          return (
            <div key={user.sourcedId} className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{user.sourcedId}</p>
                <p className="text-xs text-muted-foreground">{linked ? 'Linked' : 'Link required'}</p>
              </div>
              <select
                aria-label={`LMS profile for ${user.sourcedId}`}
                value={selected}
                onChange={(event) => onSelect(user.sourcedId as string, event.target.value)}
                className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select LMS profile</option>
                {identityLinks.profiles.map((profile) => (
                  <option key={profile.uid} value={profile.uid}>
                    {profile.display_name} ({profile.email})
                  </option>
                ))}
              </select>
              <Button size="sm" variant={linked ? 'outline' : 'default'} disabled={!selected || linkingSourceId !== null} onClick={() => onLink(user.sourcedId as string)}>
                <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {linkingSourceId === user.sourcedId ? 'Linking...' : linked ? 'Relink' : 'Link'}
              </Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ImportHistory({
  jobs,
  loading,
  reviewingJobId,
  onReview,
}: {
  jobs: ImportJob[]
  loading: boolean
  reviewingJobId: string | null
  onReview: (jobId: string) => void
}) {
  return (
    <section aria-labelledby="import-history-heading" className="pt-2">
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 id="import-history-heading" className="text-sm font-semibold text-foreground">Recent imports</h2>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-white">
        {loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">Loading imports...</p>
        ) : jobs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Started</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Rows</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Changes</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Quarantine</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatTimestamp(job.created_at)}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{formatStatus(job.status)}</Badge></td>
                  <td className="px-4 py-3 text-right">{job.total_rows}</td>
                  <td className="px-4 py-3 text-right">{job.created + job.updated + job.deactivated}</td>
                  <td className="px-4 py-3 text-right text-rose-700">{job.quarantined}</td>
                  <td className="px-4 py-3 text-right">
                    {job.connection_id && ['validated', 'ready'].includes(job.status) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewingJobId !== null}
                        onClick={() => onReview(job.id)}
                      >
                        <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                        {reviewingJobId === job.id ? 'Opening...' : 'Review'}
                      </Button>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function SummaryCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'success' | 'danger'
}) {
  const valueClass = tone === 'success'
    ? 'text-emerald-700'
    : tone === 'danger'
      ? 'text-rose-700'
      : 'text-foreground'

  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${valueClass}`}>{value}</p>
    </div>
  )
}
