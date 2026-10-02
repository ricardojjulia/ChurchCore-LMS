'use server'

import { createClient } from '@/utils/supabase/server'
import {
  createDirectUploadUrl,
  generateSignedPlaybackToken,
  recordVideoHeartbeat,
  type PlaybackTokenResult,
  type VideoHeartbeatResult,
} from '@/lib/video'

export async function requestVideoUploadUrl({
  blockId,
  title,
}: {
  blockId?: string
  title?: string
}): Promise<{ success: boolean; uploadUrl?: string; assetId?: string; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id, role')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id || !['admin', 'manager', 'teacher', 'platform_admin'].includes(profile.role)) {
      return { success: false, error: 'Insufficient permissions to upload course videos' }
    }

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
      return { success: false, error: dbErr?.message || 'Failed to initialize video record' }
    }

    return {
      success: true,
      uploadUrl,
      assetId: asset.id,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request video upload URL' }
  }
}

export async function getVideoPlaybackInfo({
  assetId,
}: {
  assetId: string
}): Promise<{
  success: boolean
  playback?: PlaybackTokenResult & { durationSeconds?: number | null; title?: string | null }
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) return { success: false, error: 'Profile not found' }

    const { data: asset, error: assetErr } = await supabase
      .from('video_assets')
      .select('*')
      .eq('id', assetId)
      .eq('org_id', profile.org_id)
      .single()

    if (assetErr || !asset) {
      return { success: false, error: 'Video asset not found' }
    }

    const playbackId = asset.provider_playback_id || asset.provider_asset_id || asset.id
    const tokenResult = generateSignedPlaybackToken({
      playbackId,
      viewerUid: profile.uid,
    })

    return {
      success: true,
      playback: {
        ...tokenResult,
        durationSeconds: asset.duration_seconds ? Number(asset.duration_seconds) : null,
        title: asset.title,
        captions: asset.captions || [],
      },
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to generate video playback token' }
  }
}

export async function sendVideoHeartbeat({
  videoAssetId,
  blockId,
  currentSeconds,
  maxPosition,
  duration,
}: {
  videoAssetId: string
  blockId?: string | null
  currentSeconds: number
  maxPosition: number
  duration: number
}): Promise<VideoHeartbeatResult> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, completed: false, progressPercent: 0, error: 'Unauthorized' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('uid, org_id')
      .eq('auth_id', user.id)
      .single()

    if (!profile?.org_id) {
      return { success: false, completed: false, progressPercent: 0, error: 'Profile not found' }
    }

    return await recordVideoHeartbeat(supabase, {
      videoAssetId,
      blockId,
      userUid: profile.uid,
      orgId: profile.org_id,
      currentSeconds,
      maxPosition,
      duration,
    })
  } catch (err: any) {
    return { success: false, completed: false, progressPercent: 0, error: err?.message }
  }
}
