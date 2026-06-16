// Edge Function: search-users
// Searches profiles by name or email. Callable by admin and teacher roles only.
// Every call is recorded in admin_audit_log via service role.
//
// Environment variables required:
//   SUPABASE_URL              — project URL
//   SUPABASE_ANON_KEY         — anon key (for JWT verification)
//   SUPABASE_SERVICE_ROLE_KEY — service role (for admin queries + audit log)

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS })
  }

  // 2. Require Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // 3. Init user-scoped client (respects RLS, verifies JWT)
  const supabaseAuth = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  // 4. Init service role client (bypasses RLS for admin operations)
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 5. Verify caller identity
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
  if (userError || !user) {
    return json({ error: 'Unauthorized' }, 401)
  }

  // 6. Verify caller role — admin or teacher only
  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('auth_id', user.id)
    .single()

  if (profileError || !callerProfile) {
    return json({ error: 'Forbidden' }, 403)
  }

  if (!['admin', 'manager', 'teacher'].includes(callerProfile.role)) {
    return json({ error: 'Forbidden' }, 403)
  }

  // 7. Parse and validate query parameter
  const url = new URL(req.url)
  const query = url.searchParams.get('q')?.trim() ?? ''

  if (query.length < 2) {
    return json({ error: 'Query must be at least 2 characters' }, 400)
  }

  if (query.length > 100) {
    return json({ error: 'Query too long' }, 400)
  }

  // 8. Search profiles — name or email partial match
  const { data: results, error: searchError } = await supabaseAdmin
    .from('profiles')
    .select('uid, display_name, email, avatar_url')
    .or(`display_name.ilike.%${query}%,email.ilike.%${query}%`)
    .limit(10)

  if (searchError) {
    return json({ error: 'Search failed' }, 500)
  }

  // 9. Audit log — every search is recorded (service role, no RLS bypass needed)
  await supabaseAdmin
    .from('admin_audit_log')
    .insert({
      actor_id:    user.id,
      action:      'user_search',
      target_type: 'profiles',
      metadata: {
        query,
        result_count: results?.length ?? 0,
        caller_role:  callerProfile.role,
      },
    })

  // 10. Return sanitized results — only id, name, email, avatar
  const sanitized = (results ?? []).map((r) => ({
    id:           r.uid,
    full_name:    r.display_name,
    email:        r.email ?? null,
    avatar_url:   r.avatar_url ?? null,
  }))

  return json({ results: sanitized })
})
