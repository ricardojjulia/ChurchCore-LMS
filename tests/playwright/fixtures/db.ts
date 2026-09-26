// Service-role access to the disposable test stack, for asserting what a UI
// flow actually persisted and for resetting a flow's own rows before it runs.
// Never used against production (auth.setup.ts refuses non-local Supabase).
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.TEST_SUPABASE_URL
    const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY are required')
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url)) throw new Error(`Refusing service-role access to non-local ${url}`)
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return client
}

// Unique, greppable label for rows a run creates.
export const runTag = () => `Suite ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
