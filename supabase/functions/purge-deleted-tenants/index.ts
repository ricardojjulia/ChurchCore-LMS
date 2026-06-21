import { serve }         from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient }  from 'https://esm.sh/@supabase/supabase-js@2'

// Authenticated via CRON_SECRET header — called nightly by Supabase CRON or external scheduler.
// Hard-deletes orgs that have been soft-deleted for more than 30 days.
// Deletion order respects FK dependencies (child rows first).

const RETENTION_DAYS = 30

serve(async (req: Request) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase       = createClient(supabaseUrl, serviceRoleKey)

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()

  const { data: orgs, error: fetchErr } = await supabase
    .from('organizations')
    .select('id, name, deleted_at')
    .eq('status', 'deleted')
    .lt('deleted_at', cutoff)

  if (fetchErr) {
    console.error('purge-deleted-tenants: fetch error', fetchErr.message)
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 })
  }

  if (!orgs || orgs.length === 0) {
    return new Response(JSON.stringify({ purged: 0 }), { status: 200 })
  }

  const results = []

  for (const org of orgs) {
    console.log(`purge-deleted-tenants: purging ${org.name} (${org.id}), deleted_at=${org.deleted_at}`)

    // Delete child rows in FK-safe order before deleting the org itself.
    // Tables with ON DELETE CASCADE will clean up automatically, but explicit
    // deletions here give us control over order and logging.
    const childTables = [
      'block_submissions',
      'course_certificates',
      'guardian_links',
      'messages',
      'message_thread_participants',
      'message_threads',
      'notifications',
      'announcement_reads',
      'announcements',
      'calendar_events',
      'enrollments',
      'courses',
      'profile_roles',
      'profiles',
      'platform_audit_log',
    ]

    let failed = false
    for (const table of childTables) {
      const { error } = await supabase.from(table).delete().eq('org_id', org.id)
      if (error) {
        // platform_audit_log uses target_org, not org_id
        if (table === 'platform_audit_log') {
          const { error: e2 } = await supabase.from(table).delete().eq('target_org', org.id)
          if (e2) { console.error(`purge: ${table} error`, e2.message); failed = true; break }
        } else {
          console.error(`purge: ${table} error`, error.message)
          failed = true
          break
        }
      }
    }

    if (failed) {
      results.push({ id: org.id, ok: false })
      continue
    }

    const { error: delErr } = await supabase.from('organizations').delete().eq('id', org.id)
    if (delErr) {
      console.error(`purge: organizations delete error for ${org.id}`, delErr.message)
      results.push({ id: org.id, ok: false, error: delErr.message })
      continue
    }

    console.log(`purge-deleted-tenants: purged ${org.name}`)
    results.push({ id: org.id, ok: true })
  }

  return new Response(
    JSON.stringify({ purged: results.filter(r => r.ok).length, results }),
    { status: 200 },
  )
})
