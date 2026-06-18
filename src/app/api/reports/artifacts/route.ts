import { NextResponse } from 'next/server'

import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getReportArtifactsForUser } from '@/lib/reporting/report-queries'

type Profile = {
  uid: string
  role: string
  org_id: string | null
}

type AuthenticatedProfile = Omit<Profile, 'org_id'> & {
  org_id: string
}

type DeleteArtifactBody = {
  artifactId?: unknown
}

async function getCurrentProfile(): Promise<
  | { supabase: Awaited<ReturnType<typeof createServerClient>>; profile: AuthenticatedProfile }
  | { response: NextResponse }
> {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (error || !profile?.org_id) {
    return { response: NextResponse.json({ error: 'Profile not found' }, { status: 404 }) }
  }

  return { supabase, profile: { ...profile, org_id: profile.org_id } }
}

export async function GET() {
  const context = await getCurrentProfile()
  if ('response' in context) return context.response

  const { profile } = context
  const artifacts = await getReportArtifactsForUser(profile.org_id, profile.uid, profile.role)
  return NextResponse.json({ artifacts, userId: profile.uid })
}

export async function DELETE(request: Request) {
  const context = await getCurrentProfile()
  if ('response' in context) return context.response

  let body: DeleteArtifactBody
  try {
    body = (await request.json()) as DeleteArtifactBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.artifactId !== 'string') {
    return NextResponse.json({ error: 'artifactId is required' }, { status: 400 })
  }

  const { profile } = context
  const service = createServiceRoleClient()
  const { data: artifact, error: findError } = await service
    .from('report_artifacts')
    .select('id, org_id, generated_by')
    .eq('id', body.artifactId)
    .eq('org_id', profile.org_id)
    .maybeSingle<{ id: string; org_id: string; generated_by: string | null }>()

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 })
  }

  if (!artifact) {
    return NextResponse.json({ error: 'Report artifact not found' }, { status: 404 })
  }

  if (artifact.generated_by !== profile.uid) {
    return NextResponse.json({ error: 'Cannot delete another user report artifact' }, { status: 403 })
  }

  const { error: updateError } = await service
    .from('report_artifacts')
    .update({ expires_at: new Date().toISOString() })
    .eq('id', artifact.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
