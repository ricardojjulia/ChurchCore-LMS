import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { applyChurchCoreDelivery } from '@/lib/churchcore-connect'

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

    if (delivery.status === 'applied') {
      return NextResponse.json({ error: 'Delivery has already been applied' }, { status: 400 })
    }

    const result = await applyChurchCoreDelivery(supabase, {
      deliveryId: delivery.id,
      orgId: profile.org_id,
      connectionId: delivery.connection_id,
      adminUid: profile.uid,
      payload: delivery.payload,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to apply delivery' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      appliedCounts: result.appliedCounts,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
