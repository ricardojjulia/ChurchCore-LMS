import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { drainPushQueue, enqueuePushNotification } from '@/lib/push'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json().catch(() => ({}))

    // If test push requested
    if (body.type === 'test') {
      const enq = await enqueuePushNotification(supabase, {
        orgId: profile.org_id,
        userId: profile.uid,
        eventType: 'test_push',
        title: 'ChurchCore Notifications Connected',
        body: 'Push notifications are active and configured for this device.',
        deepLink: '/notifications',
      })

      const summary = await drainPushQueue(supabase, 5)

      return NextResponse.json({
        success: true,
        enqueued: enq.enqueued,
        summary,
      })
    }

    // Otherwise standard drain
    const summary = await drainPushQueue(supabase, 25)
    return NextResponse.json({ success: true, summary })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
