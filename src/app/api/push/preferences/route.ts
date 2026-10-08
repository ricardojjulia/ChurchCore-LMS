import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { DEFAULT_PUSH_PREFS, type PushNotificationPrefs } from '@/lib/push'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, notification_prefs')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const prefs: PushNotificationPrefs = {
      ...DEFAULT_PUSH_PREFS,
      ...(profile.notification_prefs || {}),
    }

    return NextResponse.json({ preferences: prefs })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, notification_prefs')
      .eq('auth_id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    const body = await req.json()
    const currentPrefs = profile.notification_prefs || DEFAULT_PUSH_PREFS

    const updatedPrefs: PushNotificationPrefs = {
      ...DEFAULT_PUSH_PREFS,
      ...currentPrefs,
      ...body,
    }

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({
        notification_prefs: updatedPrefs,
        updated_at: new Date().toISOString(),
      })
      .eq('uid', profile.uid)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ preferences: updatedPrefs })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
