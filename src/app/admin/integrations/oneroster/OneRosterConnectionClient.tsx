'use client'

import { useEffect, useState } from 'react'
import { Check, Clipboard, RefreshCw, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Connection {
  id: string
  name: string
  enabled: boolean
  source_tenant_id: string
  status: string
  schedule_interval_minutes: number
  signature_key_id: string
  signature_public_key: string
  last_attempt_at: string | null
  last_success_at: string | null
  next_expected_at: string | null
  deliveryEndpoint: string
}

interface Attempt {
  id: string
  delivery_id: string
  job_id: string | null
  status: string
  error_code: string | null
  total_rows: number
  quarantined_rows: number
  delivered_at: string
}

interface ConnectionResponse {
  connection: Connection | null
  attempts?: Attempt[]
}

const fieldClass = 'mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200'

export function OneRosterConnectionClient() {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [name, setName] = useState('ChurchCore Academy')
  const [sourceTenantId, setSourceTenantId] = useState('')
  const [keyId, setKeyId] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [interval, setInterval] = useState(60)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/integrations/oneroster/connections')
      const body = await response.json() as ConnectionResponse & { error?: string }
      if (!response.ok) {
        setError(body.error ?? 'Unable to load connection')
        return
      }
      setConnection(body.connection)
      setAttempts(body.attempts ?? [])
      if (body.connection) {
        setName(body.connection.name)
        setSourceTenantId(body.connection.source_tenant_id)
        setKeyId(body.connection.signature_key_id)
        setPublicKey(body.connection.signature_public_key)
        setInterval(body.connection.schedule_interval_minutes)
        setEnabled(body.connection.enabled)
      }
    } catch {
      setError('Unable to load connection')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (saving) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const response = await fetch('/api/integrations/oneroster/connections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: connection?.id,
          name,
          sourceTenantId,
          keyId,
          publicKey,
          scheduleIntervalMinutes: interval,
          enabled,
        }),
      })
      const body = await response.json() as ConnectionResponse & { error?: string }
      if (!response.ok || !body.connection) {
        setError(body.error ?? 'Connection could not be saved')
        return
      }
      setConnection(body.connection)
      setSaved(true)
    } catch {
      setError('Connection could not be saved')
    } finally {
      setSaving(false)
    }
  }

  async function copyEndpoint() {
    if (!connection) return
    await navigator.clipboard.writeText(`${window.location.origin}${connection.deliveryEndpoint}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (loading) return <p className="py-10 text-sm text-muted-foreground">Loading connection...</p>

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {saved && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Connection saved.</div>}

      <section aria-labelledby="connection-settings-heading" className="border-y border-border py-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 id="connection-settings-heading" className="text-base font-semibold text-foreground">Academy connection</h2>
          <Badge variant="outline">{connection?.status ?? 'Not configured'}</Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-foreground">
            Name
            <input className={fieldClass} value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-foreground">
            Academy tenant ID
            <input className={fieldClass} value={sourceTenantId} maxLength={200} onChange={(event) => setSourceTenantId(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-foreground">
            Key ID
            <input className={fieldClass} value={keyId} maxLength={120} onChange={(event) => setKeyId(event.target.value)} />
          </label>
          <label className="text-sm font-medium text-foreground">
            Delivery cadence
            <select className={fieldClass} value={interval} onChange={(event) => setInterval(Number(event.target.value))}>
              <option value={15}>Every 15 minutes</option>
              <option value={60}>Hourly</option>
              <option value={360}>Every 6 hours</option>
              <option value={720}>Every 12 hours</option>
              <option value={1440}>Daily</option>
              <option value={10080}>Weekly</option>
            </select>
          </label>
        </div>

        <label className="mt-4 block text-sm font-medium text-foreground">
          Ed25519 public key
          <textarea
            className="mt-1 min-h-36 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            value={publicKey}
            maxLength={4096}
            spellCheck={false}
            onChange={(event) => setPublicKey(event.target.value)}
          />
        </label>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="h-4 w-4 rounded border-input" />
            Accept signed deliveries
          </label>
          <Button onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </section>

      {connection && (
        <section aria-labelledby="delivery-status-heading" className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 id="delivery-status-heading" className="text-base font-semibold text-foreground">Delivery status</h2>
            <Button variant="ghost" size="icon" onClick={() => void load()} title="Refresh delivery status" aria-label="Refresh delivery status">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            <StatusValue label="Last attempt" value={formatTimestamp(connection.last_attempt_at)} />
            <StatusValue label="Last success" value={formatTimestamp(connection.last_success_at)} />
            <StatusValue label="Next expected" value={formatTimestamp(connection.next_expected_at)} />
          </div>

          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Delivery endpoint</p>
            <div className="mt-1 flex min-w-0 items-center gap-2 rounded-md border border-border bg-slate-50 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-xs text-foreground">{connection.deliveryEndpoint}</code>
              <Button variant="ghost" size="icon" onClick={() => void copyEndpoint()} title="Copy delivery endpoint" aria-label="Copy delivery endpoint">
                {copied ? <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : <Clipboard className="h-4 w-4" aria-hidden="true" />}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-border bg-white">
            {attempts.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No deliveries yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Delivered</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Rows</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Quarantine</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {attempts.map((attempt) => (
                    <tr key={attempt.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatTimestamp(attempt.delivered_at)}</td>
                      <td className="px-4 py-3"><Badge variant="outline">{formatStatus(attempt.status)}</Badge></td>
                      <td className="px-4 py-3 text-right">{attempt.total_rows}</td>
                      <td className="px-4 py-3 text-right text-rose-700">{attempt.quarantined_rows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function StatusValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-slate-200 pl-3">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  )
}

function formatTimestamp(value: string | null) {
  if (!value) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}
