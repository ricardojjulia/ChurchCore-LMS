import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createDirectUploadUrl } from '@/lib/video'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id || !['admin', 'manager', 'teacher', 'platform_admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const { blockId, title } = body

    const { uploadUrl, uploadId, assetId } = await createDirectUploadUrl({
      orgId: profile.org_id,
      title: title || 'Course Video Lesson',
    })

    const { data: asset, error: dbErr } = await supabase
      .from('video_assets')
      .insert({
        org_id: profile.org_id,
        block_id: blockId || null,
        provider: 'mux',
        provider_upload_id: uploadId,
        provider_asset_id: assetId,
        title: title || 'Lesson Video',
        status: 'preparing',
      })
      .select('id')
      .single()

    if (dbErr || !asset) {
      return NextResponse.json({ error: 'Failed to create asset record' }, { status: 500 })
    }

    return NextResponse.json({
      uploadUrl,
      assetId: asset.id,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 })
  }
}
