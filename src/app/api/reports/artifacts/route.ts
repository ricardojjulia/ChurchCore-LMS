import { NextResponse } from 'next/server'

import { createServerClient } from '@/lib/supabase/server'
import { getReportArtifactsForUser } from '@/lib/reporting/report-queries'

type Profile = {
  uid: string
  role: string
  org_id: string | null
}

export async function GET() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single<Profile>()

  if (error || !profile?.org_id) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const artifacts = await getReportArtifactsForUser(profile.org_id, profile.uid, profile.role)
  return NextResponse.json({ artifacts, userId: profile.uid })
}
