import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { computeStagingDiff } from '@/lib/churchcore-connect'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const { data: delivery, error: delErr } = await supabase
      .from('churchcore_deliveries')
      .select('*')
      .eq('id', id)
      .eq('org_id', profile.org_id)
      .single()

    if (delErr || !delivery) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    // Fetch existing LMS context
    const { data: existingLinks } = await supabase
      .from('external_entity_links')
      .select('external_id, internal_id')
      .eq('org_id', profile.org_id)
      .eq('source_system', 'churchcore')

    const { data: existingProfiles } = await supabase
      .from('profiles')
      .select('uid, email, full_name, profile_roles(role)')
      .eq('org_id', profile.org_id)

    const { data: existingCohorts } = await supabase
      .from('external_entity_links')
      .select('external_id')
      .eq('org_id', profile.org_id)
      .eq('source_system', 'churchcore')
      .eq('object_type', 'group')

    const profilesByExternalId = new Map<string, any>()
    const profilesByEmail = new Map<string, any>()

    const linkMap = new Map((existingLinks || []).map(l => [l.external_id, l.internal_id]))

    for (const p of existingProfiles || []) {
      const role = (p.profile_roles?.[0] as any)?.role || 'student'
      if (p.email) profilesByEmail.set(p.email.toLowerCase(), { uid: p.uid, email: p.email, role, full_name: p.full_name })
    }

    for (const [extId, intId] of linkMap.entries()) {
      const p = (existingProfiles || []).find(prof => prof.uid === intId)
      if (p) {
        const role = (p.profile_roles?.[0] as any)?.role || 'student'
        profilesByExternalId.set(extId, { uid: p.uid, email: p.email, role, full_name: p.full_name })
      }
    }

    const cohortExtIds = new Set((existingCohorts || []).map(c => c.external_id))

    const diff = computeStagingDiff(delivery.payload, {
      profilesByExternalId,
      profilesByEmail,
      existingCohortExternalIds: cohortExtIds,
    })

    return NextResponse.json({
      delivery_id: delivery.id,
      status: delivery.status,
      diff,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
