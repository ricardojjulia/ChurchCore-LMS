'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { StagingDiff } from '@/lib/churchcore-connect'

interface Connection {
  id: string
  church_ref: string
  connect_url: string
  their_public_key: string
  their_key_id: string
  our_key_id: string
  status: 'pending' | 'connected' | 'revoked' | 'error'
  auto_apply: boolean
  updated_at: string
}

interface Delivery {
  id: string
  delivery_id: string
  version: string
  payload_type: 'snapshot' | 'delta'
  status: 'staged' | 'previewed' | 'applied' | 'rejected' | 'error'
  stats: any
  applied_at: string | null
  created_at: string
  payload: any
}

interface OutboundEvent {
  id: string
  event_type: string
  status: string
  attempt_count: number
  created_at: string
  payload: any
}

interface Props {
  initialConnection: Connection | null
  deliveries: Delivery[]
  outboundEvents: OutboundEvent[]
  orgId: string
}

export default function ChurchCoreConnectWorkspace({
  initialConnection,
  deliveries: initialDeliveries,
  outboundEvents: initialOutboundEvents,
  orgId,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'connection' | 'status' | 'review'>('connection')

  const [connection, setConnection] = useState<Connection | null>(initialConnection)
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries)
  const [outboundEvents] = useState<OutboundEvent[]>(initialOutboundEvents)

  // Form State
  const [churchRef, setChurchRef] = useState(connection?.church_ref || '')
  const [connectUrl, setConnectUrl] = useState(connection?.connect_url || 'https://churchcore.example.com/api/lms-connect')
  const [theirPublicKey, setTheirPublicKey] = useState(connection?.their_public_key || '')
  const [theirKeyId, setTheirKeyId] = useState(connection?.their_key_id || '')
  const [autoApply, setAutoApply] = useState(connection?.auto_apply || false)

  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [generatedOurKey, setGeneratedOurKey] = useState<string | null>(null)

  // Review & Diff State
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null)
  const [previewDiff, setPreviewDiff] = useState<StagingDiff | null>(null)
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<any | null>(null)

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveSuccess(null)
    setSaveError(null)

    try {
      const res = await fetch('/api/integrations/churchcore/connection', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchRef,
          connectUrl,
          theirPublicKey,
          theirKeyId,
          autoApply,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save connection')

      setConnection(data.connection)
      if (data.ourPublicKey) {
        setGeneratedOurKey(data.ourPublicKey)
      }
      setSaveSuccess('ChurchCore Connect successfully configured and paired!')
      router.refresh()
    } catch (err: any) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this ChurchCore connection? Syncing will stop immediately.')) return

    try {
      const res = await fetch('/api/integrations/churchcore/connection', { method: 'DELETE' })
      if (res.ok) {
        setConnection(null)
        router.refresh()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleFetchPreview = async (delId: string) => {
    setSelectedDeliveryId(delId)
    setLoadingDiff(true)
    setPreviewDiff(null)
    setApplyResult(null)

    try {
      const res = await fetch(`/api/integrations/churchcore/deliveries/${delId}/preview`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setPreviewDiff(data.diff)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDiff(false)
    }
  }

  const handleApplyDelivery = async (delId: string) => {
    setApplying(true)
    setApplyResult(null)

    try {
      const res = await fetch(`/api/integrations/churchcore/deliveries/${delId}/apply`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to apply delivery')

      setApplyResult(data.appliedCounts)
      // Update delivery status locally
      setDeliveries(prev => prev.map(d => (d.id === delId ? { ...d, status: 'applied', applied_at: new Date().toISOString() } : d)))
      router.refresh()
    } catch (err: any) {
      alert(`Apply error: ${err.message}`)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-4">
        <button
          onClick={() => setActiveTab('connection')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'connection'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          ⚙️ Connection & Security
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'status'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📊 Sync & Outbound Status
        </button>
        <button
          onClick={() => setActiveTab('review')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'review'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          📥 Staged Deliveries Queue
          {deliveries.filter(d => d.status === 'staged').length > 0 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">
              {deliveries.filter(d => d.status === 'staged').length}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Connection & Security */}
      {activeTab === 'connection' && (
        <div className="space-y-6">
          {connection && connection.status === 'connected' && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/80 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                <div>
                  <h4 className="text-sm font-semibold text-emerald-300">Connected to ChurchCore ChMS</h4>
                  <p className="text-xs text-emerald-400/80">Church Reference: {connection.church_ref}</p>
                </div>
              </div>
              <button
                onClick={handleRevoke}
                className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800 text-xs font-semibold transition-all"
              >
                Revoke Connection
              </button>
            </div>
          )}

          <form onSubmit={handleSaveConnection} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>🔐</span> Ed25519 Cryptographic Handshake Pairing
            </h3>
            <p className="text-sm text-slate-400">
              Configure secure, signed communication between your LMS tenant and your ChurchCore instance. Both sides verify messages using public keys.
            </p>

            {saveSuccess && (
              <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-700 text-sm text-emerald-200">
                {saveSuccess}
              </div>
            )}
            {saveError && (
              <div className="p-4 rounded-xl bg-red-950/60 border border-red-700 text-sm text-red-200">
                {saveError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Church Reference / Slug
                </label>
                <input
                  type="text"
                  required
                  value={churchRef}
                  onChange={e => setChurchRef(e.target.value)}
                  placeholder="e.g. grace-community-church"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ChurchCore Connect Webhook Endpoint
                </label>
                <input
                  type="url"
                  required
                  value={connectUrl}
                  onChange={e => setConnectUrl(e.target.value)}
                  placeholder="https://church.example.com/api/lms-connect"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  ChurchCore Key ID (Their Key ID)
                </label>
                <input
                  type="text"
                  required
                  value={theirKeyId}
                  onChange={e => setTheirKeyId(e.target.value)}
                  placeholder="e.g. cc-key-2026-q4"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Our LMS Receiver Endpoint
                </label>
                <input
                  type="text"
                  readOnly
                  value={`/api/integrations/churchcore/deliveries`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 text-sm font-mono cursor-not-allowed"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                ChurchCore Ed25519 Public Key (PEM)
              </label>
              <textarea
                required
                rows={4}
                value={theirPublicKey}
                onChange={e => setTheirPublicKey(e.target.value)}
                placeholder="-----BEGIN PUBLIC KEY-----&#10;MCowBQYDK2VwAyEA...&#10;-----END PUBLIC KEY-----"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
              <input
                type="checkbox"
                id="autoApply"
                checked={autoApply}
                onChange={e => setAutoApply(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-700"
              />
              <label htmlFor="autoApply" className="text-xs text-slate-300">
                <span className="font-semibold text-white">Enable Safe Auto-Apply:</span> Automatically apply routine incremental delta deliveries that contain no privilege elevations or mass deactivations (COUNCIL-2026-038).
              </label>
            </div>

            {generatedOurKey && (
              <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-700/60 space-y-2">
                <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                  📋 Our Public Key (Copy & Paste into ChurchCore)
                </h4>
                <textarea
                  readOnly
                  rows={4}
                  value={generatedOurKey}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 text-indigo-200 text-xs font-mono border border-indigo-800/80"
                />
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all"
              >
                {saving ? 'Saving...' : 'Save & Verify Connection'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Status & Outbound */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Total Inbound Deliveries</span>
              <p className="text-2xl font-bold text-white mt-1">{deliveries.length}</p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Outbound Queue Pending</span>
              <p className="text-2xl font-bold text-amber-400 mt-1">
                {outboundEvents.filter(e => e.status === 'pending').length}
              </p>
            </div>
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs text-slate-400">Outbound Events Delivered</span>
              <p className="text-2xl font-bold text-emerald-400 mt-1">
                {outboundEvents.filter(e => e.status === 'delivered').length}
              </p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📤</span> Recent Outbound Sync Events (LMS → ChurchCore)
            </h3>
            <p className="text-xs text-slate-400">
              Completed courses, issued certificates, and milestone achievements synced back to ChurchCore member records.
            </p>

            {outboundEvents.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-4">No outbound events recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {outboundEvents.slice(0, 10).map(evt => (
                  <div key={evt.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-semibold text-white capitalize">
                        {evt.event_type.replace('_', ' ')}
                      </span>
                      <span className="text-slate-500 ml-2">
                        {new Date(evt.created_at).toLocaleString()}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full font-medium ${
                        evt.status === 'delivered'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : evt.status === 'pending'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {evt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Staged Deliveries & Review Queue */}
      {activeTab === 'review' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <span>📥</span> Inbound Deliveries
            </h3>
            <p className="text-xs text-slate-400">
              Inspect snapshot/delta sync deliveries staged from ChurchCore, review diffs, and apply changes.
            </p>

            {deliveries.length === 0 ? (
              <p className="text-sm text-slate-500 italic py-4">No deliveries staged yet.</p>
            ) : (
              <div className="space-y-3">
                {deliveries.map(del => (
                  <div
                    key={del.id}
                    className={`p-4 rounded-xl border transition-all ${
                      selectedDeliveryId === del.id
                        ? 'bg-indigo-950/20 border-indigo-500/50'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-white text-sm">{del.delivery_id}</span>
                          <span className="px-2 py-0.5 rounded-md text-xs bg-slate-800 text-slate-300 uppercase">
                            {del.payload_type}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-md text-xs font-semibold uppercase ${
                              del.status === 'applied'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : 'bg-amber-950 text-amber-400 border border-amber-800'
                            }`}
                          >
                            {del.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Received: {new Date(del.created_at).toLocaleString()}
                          {del.applied_at && ` · Applied: ${new Date(del.applied_at).toLocaleString()}`}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleFetchPreview(del.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all"
                        >
                          Inspect Diff
                        </button>
                        {del.status === 'staged' && (
                          <button
                            onClick={() => handleApplyDelivery(del.id)}
                            disabled={applying}
                            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
                          >
                            {applying ? 'Applying...' : 'Apply Delivery'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Staging Diff Inspector */}
          {selectedDeliveryId && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>🔍</span> Staging Diff Inspector
                </h3>
                {deliveries.find(d => d.id === selectedDeliveryId)?.status === 'staged' && (
                  <button
                    onClick={() => handleApplyDelivery(selectedDeliveryId)}
                    disabled={applying}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all"
                  >
                    {applying ? 'Applying Changes...' : 'Approve & Apply This Delivery'}
                  </button>
                )}
              </div>

              {loadingDiff ? (
                <p className="text-sm text-slate-400 py-4">Computing diff...</p>
              ) : applyResult ? (
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-700 text-sm text-emerald-200 space-y-1">
                  <p className="font-bold">✓ Delivery Applied Successfully!</p>
                  <ul className="text-xs list-disc list-inside space-y-0.5">
                    <li>Profiles Created: {applyResult.profilesCreated}</li>
                    <li>Profiles Updated: {applyResult.profilesUpdated}</li>
                    <li>Profiles Deactivated: {applyResult.profilesDeactivated}</li>
                    <li>Cohorts / Groups Synced: {applyResult.cohortsSynced}</li>
                  </ul>
                </div>
              ) : previewDiff ? (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-xs text-slate-500">Creates</span>
                      <p className="text-lg font-bold text-emerald-400">{previewDiff.summary.total_creates}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-xs text-slate-500">Updates</span>
                      <p className="text-lg font-bold text-indigo-400">{previewDiff.summary.total_updates}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-xs text-slate-500">Deactivations</span>
                      <p className="text-lg font-bold text-red-400">{previewDiff.summary.total_deactivates}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <span className="text-xs text-slate-500">Requires Review</span>
                      <p className="text-lg font-bold text-amber-400">{previewDiff.summary.total_reviews_required}</p>
                    </div>
                  </div>

                  {/* Members Diff List */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-300">People & Roles ({previewDiff.members.length})</h4>
                    <div className="divide-y divide-slate-800 max-h-64 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                      {previewDiff.members.map(m => (
                        <div key={m.id} className="p-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-white">{m.name}</span>
                            <p className="text-slate-400 mt-0.5">{m.details}</p>
                            {m.warning && <p className="text-amber-400 font-medium mt-0.5">⚠️ {m.warning}</p>}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium uppercase ${
                              m.action === 'create'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                : m.action === 'update'
                                ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                                : m.action === 'link'
                                ? 'bg-teal-950 text-teal-400 border border-teal-800'
                                : 'bg-red-950 text-red-400 border border-red-800'
                            }`}
                          >
                            {m.action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Groups & Ministries Diff List */}
                  {(previewDiff.groups.length > 0 || previewDiff.ministries.length > 0) && (
                    <div className="space-y-3">
                      <h4 className="text-sm font-bold text-slate-300">
                        Groups & Ministries ({previewDiff.groups.length + previewDiff.ministries.length})
                      </h4>
                      <div className="divide-y divide-slate-800 max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                        {[...previewDiff.groups, ...previewDiff.ministries].map(g => (
                          <div key={g.id} className="p-3 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-semibold text-white">{g.name}</span>
                              <p className="text-slate-400 mt-0.5">{g.details}</p>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium uppercase bg-indigo-950 text-indigo-400 border border-indigo-800">
                              {g.action}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
