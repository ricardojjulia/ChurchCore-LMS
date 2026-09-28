import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

// Opens a password reset link (COUNCIL-2026-045): turns the one-time token
// into a session, then sends the user to choose a new password. Verifying a
// recovery token also confirms the email address.
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash')
  // Relative Location: an absolute URL built from the request can name a
  // different host than the one the session cookie is set for.
  const to = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } })
  if (!tokenHash || tokenHash.length > 200) return to('/forgot-password?error=invalid_link')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
  if (error) return to('/forgot-password?error=invalid_link')
  return to('/account/password?reset=1')
}
