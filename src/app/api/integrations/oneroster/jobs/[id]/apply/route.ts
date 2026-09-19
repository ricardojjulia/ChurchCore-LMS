import { NextRequest, NextResponse } from 'next/server'
import { applyOneRosterJob } from '@/lib/oneroster/apply'
import { createClient } from '@/utils/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('uid, role, org_id')
    .eq('auth_id', user.id)
    .single()

  if (!profile || !['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  if (!profile.org_id) {
    return NextResponse.json({ error: 'No organization associated with account' }, { status: 403 })
  }

  const result = await applyOneRosterJob({
    jobId: id,
    orgId: profile.org_id,
    actorAuthId: user.id,
    actorUid: profile.uid,
  })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json(result)
}
