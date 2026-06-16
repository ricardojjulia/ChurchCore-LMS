import { NextResponse }      from 'next/server'
import { createClient }      from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { getHealthChecks }   from '@/lib/queries/getHealthChecks'
import type { HealthCheckResponse } from '@/types/health'

export const runtime = 'nodejs'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { supabase }
}

// POST — triggers a fresh health check run via Edge Function
export async function POST(): Promise<NextResponse> {
  const { error, supabase } = await requireAdmin()
  if (error) return error

  // Invoke the Edge Function using the service client so it receives
  // the service role JWT and can write to system_health_checks.
  const service = createServiceClient()
  const { error: invokeErr } = await service.functions.invoke('system-health-check', {
    body: { triggered_by: 'manual' },
  })

  if (invokeErr) {
    return NextResponse.json(
      { error: `Health check invocation failed: ${invokeErr.message}` },
      { status: 500 },
    )
  }

  // Read updated rows after the Edge Function has written them
  const checks = await getHealthChecks(supabase!)

  const body: HealthCheckResponse = {
    checks,
    timestamp:    new Date().toISOString(),
    triggered_by: 'manual',
  }
  return NextResponse.json(body)
}

// GET — reads last known state without invoking Edge Function
export async function GET(): Promise<NextResponse> {
  const { error, supabase } = await requireAdmin()
  if (error) return error

  const checks = await getHealthChecks(supabase!)

  const body: HealthCheckResponse = {
    checks,
    timestamp:    new Date().toISOString(),
    triggered_by: 'scheduled',
  }
  return NextResponse.json(body)
}
