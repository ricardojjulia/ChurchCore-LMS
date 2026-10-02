import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateSignedPlaybackToken } from '@/lib/video'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: asset, error } = await supabase
      .from('video_assets')
      .select('*')
      .eq('id', id)
      .eq('org_id', profile.org_id)
      .single()

    if (error || !asset) {
      return NextResponse.json({ error: 'Video asset not found' }, { status: 404 })
    }

    const playbackId = asset.provider_playback_id || asset.provider_asset_id || asset.id
    const tokenInfo = generateSignedPlaybackToken({
      playbackId,
      viewerUid: profile.uid,
    })

    return NextResponse.json({
      ...tokenInfo,
      title: asset.title,
      durationSeconds: asset.duration_seconds,
      captions: asset.captions || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
