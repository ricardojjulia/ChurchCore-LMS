import React from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function IntegrationsHubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, org_id, profile_roles(role)')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id) redirect('/dashboard')

  // Check connection statuses
  const { data: churchcoreConn } = await supabase
    .from('churchcore_connections')
    .select('status, updated_at')
    .eq('org_id', profile.org_id)
    .neq('status', 'revoked')
    .maybeSingle()

  const { data: onerosterConn } = await supabase
    .from('oneroster_connections')
    .select('status, updated_at')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
          <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            🔌
          </span>
          Integrations Hub
        </h1>
        <p className="mt-2 text-slate-400">
          Connect your LMS with church management systems, roster feeds, and third-party data providers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ChurchCore Connect (Featured) */}
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-indigo-500/30 p-6 flex flex-col justify-between shadow-xl shadow-indigo-950/20 group hover:border-indigo-500/50 transition-all">
          <div className="absolute top-4 right-4">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
              Recommended
            </span>
          </div>

          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-2xl shadow-inner">
              ⛪
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                ChurchCore Connect
                {churchcoreConn?.status === 'connected' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Seamless, cryptographically signed bidirectional sync between your ChurchCore ChMS and LMS. Syncs members, households, small groups, volunteer ministries, and learning milestones.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">Ed25519 Signed</span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">Staged Review</span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">Minors Protection</span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">COUNCIL-2026-038</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {churchcoreConn?.updated_at
                ? `Last updated ${new Date(churchcoreConn.updated_at).toLocaleDateString()}`
                : 'Not configured'}
            </div>
            <Link
              href="/admin/integrations/churchcore"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all"
            >
              Configure Connect →
            </Link>
          </div>
        </div>

        {/* OneRoster 1.2 */}
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 p-6 flex flex-col justify-between shadow-lg group hover:border-slate-700 transition-all">
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-xl bg-teal-600/20 border border-teal-500/30 flex items-center justify-center text-2xl shadow-inner">
              🎓
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                OneRoster 1.2 Feed
                {onerosterConn?.status === 'active' && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active
                  </span>
                )}
              </h2>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                Standard IMS Global OneRoster 1.2 CSV and REST feed receiver for formal Christian academies and partner educational institutions.
              </p>
            </div>

            <div className="pt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">IMS Global 1.2</span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">Academic Roster</span>
              <span className="bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/50">Ed25519 Signed</span>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {onerosterConn?.updated_at
                ? `Last updated ${new Date(onerosterConn.updated_at).toLocaleDateString()}`
                : 'Not configured'}
            </div>
            <Link
              href="/admin/integrations/oneroster"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold border border-slate-700 transition-all"
            >
              Configure OneRoster →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
