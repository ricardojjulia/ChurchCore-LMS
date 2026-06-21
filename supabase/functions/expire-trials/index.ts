import { serve }         from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2'

// Authenticated via CRON_SECRET header — called nightly by Supabase CRON or external scheduler.
// Suspends any org in 'trial' status whose trial_ends_at is in the past.

serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl       = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase          = createClient(supabaseUrl, serviceRoleKey)

  const now = new Date().toISOString()

  // Find all trials that have expired
  const { data: expired, error: fetchErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('status', 'trial')
    .lt('trial_ends_at', now)
    .is('deleted_at', null)

  if (fetchErr) {
    console.error('expire-trials: fetch error', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!expired || expired.length === 0) {
    return new Response(JSON.stringify({ suspended: 0 }), { status: 200 })
  }

  const results = []

  for (const org of expired) {
    const { error: updateErr } = await supabase
      .from('organizations')
      .update({ status: 'suspended' })
      .eq('id', org.id)

    if (updateErr) {
      console.error(`expire-trials: failed to suspend ${org.id}`, updateErr.message)
      results.push({ id: org.id, ok: false, error: updateErr.message })
      continue
    }

    const { error: syncErr } = await supabase
      .rpc('sync_org_status_to_profiles', { p_org_id: org.id })

    if (syncErr) {
      console.error(`expire-trials: sync failed for ${org.id}`, syncErr.message)
    }

    await supabase.from('platform_audit_log').insert({
      action:     'trial_expired',
      target_org: org.id,
      payload:    { name: org.name },
    })

    results.push({ id: org.id, ok: true })
    console.log(`expire-trials: suspended ${org.name} (${org.id})`)
  }

  return new Response(
    JSON.stringify({ suspended: results.filter(r => r.ok).length, results }),
    { status: 200 },
  )
})
