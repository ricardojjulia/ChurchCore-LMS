import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

const REASONS = new Set(['sso_required', 'domain_not_allowed', 'password_disabled'])

// Ends the session. Used when an org's sign-in policy (COUNCIL-2026-037)
// rejects the current session, and by the /welcome page.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: 'local' })
  const reason = req.nextUrl.searchParams.get('reason')
  const target = reason && REASONS.has(reason) ? `/login?error=${reason}` : '/login'
  return new NextResponse(null, { status: 307, headers: { Location: target } })
}
