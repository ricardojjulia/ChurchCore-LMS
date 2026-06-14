import { createClient } from '@supabase/supabase-js'

// Server-side only. Never import this in client components or expose to browser.
// Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (never committed).
export const createServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
