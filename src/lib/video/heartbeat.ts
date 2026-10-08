import type { SupabaseClient } from '@supabase/supabase-js'
import type { VideoHeartbeatParams, VideoHeartbeatResult } from './types'

export async function recordVideoHeartbeat(
  supabase: SupabaseClient,
  params: VideoHeartbeatParams
): Promise<VideoHeartbeatResult> {
  const { videoAssetId, blockId, userUid, orgId, currentSeconds, maxPosition, duration } = params

  if (!videoAssetId || !userUid || duration <= 0) {
    return { success: false, completed: false, progressPercent: 0, error: 'Invalid heartbeat parameters' }
  }

  const effectiveMaxPos = Math.max(currentSeconds, maxPosition)
  const progressPercent = Math.min(100, Math.round((effectiveMaxPos / duration) * 100))
  // COUNCIL-2026-041 reliable must_view: at least 85% watched counts as completed
  const isCompleted = progressPercent >= 85

  try {
    const { error } = await supabase
      .from('video_playback_heartbeats')
      .upsert(
        {
          org_id: orgId,
          video_asset_id: videoAssetId,
          block_id: blockId || null,
          user_uid: userUid,
          seconds_watched: currentSeconds,
          max_playback_position: effectiveMaxPos,
          completed: isCompleted,
          last_heartbeat_at: new Date().toISOString(),
        },
        { onConflict: 'video_asset_id,user_uid' }
      )

    if (error) {
      console.error('Error saving video heartbeat:', error)
      return { success: false, completed: false, progressPercent, error: error.message }
    }

    return {
      success: true,
      completed: isCompleted,
      progressPercent,
    }
  } catch (err: any) {
    console.error('Unexpected error recording video heartbeat:', err)
    return { success: false, completed: false, progressPercent, error: err?.message }
  }
}
