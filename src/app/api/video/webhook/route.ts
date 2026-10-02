import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const eventType = body.type || body.event

    const svc = createServiceClient()

    if (eventType === 'video.asset.ready' || eventType === 'video.upload.asset_created') {
      const assetData = body.data || body.asset || {}
      const uploadId = assetData.upload_id
      const assetId = assetData.id
      const playbackId = assetData.playback_ids?.[0]?.id || assetId
      const duration = assetData.duration
      const aspectRatio = assetData.aspect_ratio

      if (uploadId) {
        await svc
          .from('video_assets')
          .update({
            status: 'ready',
            provider_asset_id: assetId,
            provider_playback_id: playbackId,
            duration_seconds: duration || null,
            aspect_ratio: aspectRatio || '16:9',
            updated_at: new Date().toISOString(),
          })
          .eq('provider_upload_id', uploadId)
      } else if (assetId) {
        await svc
          .from('video_assets')
          .update({
            status: 'ready',
            provider_playback_id: playbackId,
            duration_seconds: duration || null,
            aspect_ratio: aspectRatio || '16:9',
            updated_at: new Date().toISOString(),
          })
          .eq('provider_asset_id', assetId)
      }
    } else if (eventType === 'video.asset.errored') {
      const assetData = body.data || {}
      if (assetData.id) {
        await svc
          .from('video_assets')
          .update({
            status: 'errored',
            updated_at: new Date().toISOString(),
          })
          .eq('provider_asset_id', assetData.id)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Webhook failed' }, { status: 500 })
  }
}
