import { createClient } from 'jsr:@supabase/supabase-js@2'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async () => {
  const startedAt = performance.now()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Missing Supabase service configuration' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceKey)
  const { error } = await supabase.rpc('refresh_report_materialized_views')
  const durationMs = Math.round(performance.now() - startedAt)

  if (error) {
    console.error(JSON.stringify({ event: 'refresh_report_views_failed', durationMs, error: error.message }))
    return json({ ok: false, durationMs, error: error.message }, 500)
  }

  console.log(JSON.stringify({ event: 'refresh_report_views_complete', durationMs }))
  return json({ ok: true, durationMs })
})
