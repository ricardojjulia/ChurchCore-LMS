import React from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ChurchCoreConnectWorkspace from './ChurchCoreConnectWorkspace'

export const dynamic = 'force-dynamic'

export default async function ChurchCoreConnectPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, org_id, profile_roles(role)')
    .eq('auth_id', user.id)
    .single()

  if (!profile?.org_id) redirect('/dashboard')

  // Fetch connection
  const { data: connection } = await supabase
    .from('churchcore_connections')
    .select('*')
    .eq('org_id', profile.org_id)
    .neq('status', 'revoked')
    .maybeSingle()

  // Fetch deliveries
  const { data: deliveries } = await supabase
    .from('churchcore_deliveries')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(20)

  // Fetch outbound events
  const { data: outboundEvents } = await supabase
    .from('churchcore_outbound_events')
    .select('*')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400 mb-1">
            <Link href="/admin/integrations" className="hover:underline">
              Integrations Hub
            </Link>
            <span>/</span>
            <span>ChurchCore Connect</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>⛪</span> ChurchCore Connect
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Bidirectional ChMS integration for roster sync, households, volunteer ministries, and learning milestones.
          </p>
        </div>
      </div>

      <ChurchCoreConnectWorkspace
        initialConnection={connection}
        deliveries={deliveries || []}
        outboundEvents={outboundEvents || []}
        orgId={profile.org_id}
      />
    </div>
  )
}
