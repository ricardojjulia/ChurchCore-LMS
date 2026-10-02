'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { parseCsv, type CsvRow, type ParseError } from '@/lib/parse-csv'
import { bulkInviteUsers, type BulkInviteResult } from '@/app/actions/admin'

type Step = 'upload' | 'preview' | 'done'

export default function ImportForm() {
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<CsvRow[]>([])
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [results, setResults] = useState<BulkInviteResult[]>([])
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function resetAll() {
    setStep('upload')
    setRows([])
    setParseErrors([])
    setResults([])
    setImporting(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const { rows: validRows, errors } = parseCsv(text)
    setRows(validRows)
    setParseErrors(errors)
    setStep('preview')
  }

  function handleDownloadErrors() {
    const header = 'row,error'
    const lines = parseErrors.map((err) => {
      const message = err.message.replace(/"/g, '""')
      return `${err.rowNum},"${message}"`
    })
    const csvString = [header, ...lines].join('\n')
    const blob = new Blob([csvString], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'import-errors.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (rows.length === 0 || importing) return
    setImporting(true)
    try {
      const res = await bulkInviteUsers(rows)
      setResults(res)
      setStep('done')
    } finally {
      setImporting(false)
    }
  }

  const sentCount = results.filter((r) => r.status === 'sent').length
  const skippedCount = results.filter((r) => r.status === 'skipped').length
  const failedCount = results.filter((r) => r.status === 'failed').length

  // ── Upload step ────────────────────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="space-y-5">
        {/* Rate limit warning */}
        <div className="bg-amber-950/50 border border-amber-800 rounded-xl px-5 py-4 text-sm text-amber-300">
          <strong>Note:</strong> Importing more than 3 users requires Supabase Pro plan due to invite rate limits.
        </div>

        {/* Drop zone (styled label over file input) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm p-8">
          <label
            htmlFor="csv-file-input"
            className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-700 rounded-xl px-6 py-12 cursor-pointer hover:border-indigo-500 hover:bg-slate-800/50 transition-colors"
          >
            <svg
              className="w-10 h-10 text-slate-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <div className="text-center">
              <p className="text-sm font-semibold text-white">Click to choose a CSV file</p>
              <p className="text-xs text-slate-400 mt-1">or drag and drop (use the file picker)</p>
            </div>
            <input
              ref={fileInputRef}
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          <div className="mt-6 space-y-2 text-sm text-slate-400">
            <p>
              Upload a CSV with columns: <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-xs font-mono">email</code>,{' '}
              <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-xs font-mono">display_name</code>,{' '}
              <code className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-xs font-mono">role</code>.
              Column order does not matter. Headers are case-insensitive.
            </p>
            <p className="text-xs text-amber-400 bg-amber-950/50 border border-amber-800 rounded-md px-3 py-2">
              Display names must not contain commas.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Preview step ───────────────────────────────────────────────────────────
  if (step === 'preview') {
    const totalRows = rows.length + parseErrors.length

    return (
      <div className="space-y-5">
        {/* Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm px-6 py-5">
          <p className="text-sm text-slate-300">
            <span className="font-semibold text-emerald-400">{rows.length} row{rows.length !== 1 ? 's' : ''}</span> ready to invite.
            {parseErrors.length > 0 && (
              <>
                {' '}
                <span className="font-semibold text-rose-400">{parseErrors.length} row{parseErrors.length !== 1 ? 's' : ''}</span> have errors.
              </>
            )}
          </p>
        </div>

        {/* Rate limit warning */}
        <div className="bg-amber-950/50 border border-amber-800 rounded-xl px-5 py-4 text-sm text-amber-300">
          <strong>Note:</strong> Importing more than 3 users requires Supabase Pro plan due to invite rate limits.
        </div>

        {/* Preview table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-12">Row</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Role</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {rows.map((row, i) => (
                  <tr key={`valid-${i}`} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-white">{row.email}</td>
                    <td className="px-5 py-3 text-slate-300">{row.display_name}</td>
                    <td className="px-5 py-3">
                      <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                        {row.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <Badge className="bg-emerald-950/50 text-emerald-400 border-emerald-800">
                        ✓ Ready
                      </Badge>
                    </td>
                  </tr>
                ))}
                {parseErrors.map((err, i) => (
                  <tr key={`error-${i}`} className="bg-rose-950/20 hover:bg-rose-950/30 transition-colors">
                    <td className="px-5 py-3 text-slate-400">{err.rowNum}</td>
                    <td className="px-5 py-3 text-slate-500 italic" colSpan={3}>—</td>
                    <td className="px-5 py-3">
                      <Badge className="bg-rose-950/50 text-rose-400 border-rose-800">
                        ✗ {err.message}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {totalRows === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-500 italic">
                      No rows found in this file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={resetAll} size="sm" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
              ← Back
            </Button>
            {parseErrors.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleDownloadErrors} className="text-slate-400 hover:text-white">
                Download error rows as CSV
              </Button>
            )}
          </div>
          <Button
            onClick={handleImport}
            disabled={rows.length === 0 || importing}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            {importing ? 'Sending invites…' : `Send ${rows.length} Invite${rows.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>
    )
  }

  // ── Done step ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm px-6 py-5">
        <p className="text-sm text-slate-300 font-medium">
          Invites sent:{' '}
          <span className="font-bold text-emerald-400">{sentCount}</span>
          {' | '}
          Already members:{' '}
          <span className="font-bold text-slate-400">{skippedCount}</span>
          {' | '}
          Failed:{' '}
          <span className="font-bold text-rose-400">{failedCount}</span>
        </p>
      </div>

      {/* Results table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/80">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {results.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-slate-500 italic">
                    No results.
                  </td>
                </tr>
              ) : (
                results.map((result, i) => (
                  <tr key={i} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-white">{result.email}</td>
                    <td className="px-5 py-3">
                      {result.status === 'sent' && (
                        <Badge className="bg-emerald-950/50 text-emerald-400 border-emerald-800">Sent</Badge>
                      )}
                      {result.status === 'skipped' && (
                        <Badge className="bg-slate-800 text-slate-400 border-slate-700">Skipped</Badge>
                      )}
                      {result.status === 'failed' && (
                        <Badge className="bg-rose-950/50 text-rose-400 border-rose-800">Failed</Badge>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {result.reason ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={resetAll} variant="outline" size="sm" className="border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700">
          Import another file
        </Button>
        <Link
          href="/admin/users"
          className="inline-flex items-center justify-center rounded-xl text-sm font-medium h-9 px-3 border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 transition-colors"
        >
          Back to Users
        </Link>
      </div>
    </div>
  )
}
