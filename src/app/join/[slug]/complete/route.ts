import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import { assignMembership } from '@/lib/membership'
import { autoEnrollNewJoiner } from '@/lib/join'
import { checkAuthPolicy, readAuthPolicy, signInMethods } from '@/lib/auth-policy'

export const runtime = 'nodejs'

// Finishes a "Continue with Google/Microsoft" join from /join/[slug]
// (COUNCIL-2026-037). Signing in never grants membership by itself; this
// explicit join step does, with the same checks as the password join:
// the org must be active, and the account must not already belong to an org.
// Relative redirects keep the browser on the host it used.
const redirectTo = (path: string) => new NextResponse(null, { status: 307, headers: { Location: path } })

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const safeSlug = encodeURIComponent(slug)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectTo(`/join/${safeSlug}`)

  const service = createServiceClient()
  const { data: profile } = await service.from('profiles').select('org_id').eq('auth_id', user.id).maybeSingle()
  if (profile?.org_id) return redirectTo('/dashboard')

  const { data: org } = await service
    .from('organizations').select('id, status, settings').eq('slug', slug).eq('status', 'active').maybeSingle()
  if (!org) return redirectTo(`/join/${safeSlug}?error=unavailable`)

  // The org's sign-in policy applies from the first moment (domain rules).
  const { data: claims } = await supabase.auth.getClaims()
  const violation = checkAuthPolicy(readAuthPolicy(org.settings), {
    role: 'student', email: user.email ?? null, methods: signInMethods(claims?.claims?.amr),
  })
  if (violation) return redirectTo(`/join/${safeSlug}?error=${violation}`)

  const { error } = await assignMembership(service, user.id, org.id, 'student')
  if (error) return redirectTo(`/join/${safeSlug}?error=failed`)
  await autoEnrollNewJoiner(service, org, user.id)
  return redirectTo('/dashboard?joined=1')
}
