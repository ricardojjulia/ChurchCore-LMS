import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnqueuePushOptions, PushNotificationPrefs } from './types'
import { DEFAULT_PUSH_PREFS } from './types'
import { buildSanitizedPushPayload } from './sanitizer'

export async function enqueuePushNotification(
  supabase: SupabaseClient,
  options: EnqueuePushOptions,
  hintContext?: { courseTitle?: string }
): Promise<{ enqueued: boolean; skippedReason?: string }> {
  try {
    const { orgId, userId, eventType, deepLink } = options

    // 1. Fetch user's notification preferences
    const { data: profile } = await supabase
      .from('profiles')
      .select('notification_prefs, is_active')
      .eq('uid', userId)
      .single()

    if (!profile || profile.is_active === false) {
      return { enqueued: false, skippedReason: 'user_inactive_or_not_found' }
    }

    const prefs: PushNotificationPrefs = {
      ...DEFAULT_PUSH_PREFS,
      ...(profile.notification_prefs || {}),
    }

    // 2. Check if user opted out of this specific event type
    if (eventType !== 'test_push' && prefs[eventType as keyof PushNotificationPrefs] === false) {
      return { enqueued: false, skippedReason: 'opted_out_by_user_preferences' }
    }

    // 3. Build sanitized payload (guarantees NO PII, no grades, no message text)
    const sanitized = buildSanitizedPushPayload(eventType, deepLink, hintContext)

    // 4. Enqueue into push_notification_queue
    const { error: insertErr } = await supabase
      .from('push_notification_queue')
      .insert({
        org_id: orgId,
        user_id: userId,
        event_type: eventType,
        title: sanitized.title,
        body: sanitized.body,
        deep_link: sanitized.deep_link,
        status: 'pending',
        attempt_count: 0,
        next_retry_at: new Date().toISOString(),
      })

    if (insertErr) {
      console.error('Failed to enqueue push notification:', insertErr)
      return { enqueued: false, skippedReason: insertErr.message }
    }

    return { enqueued: true }
  } catch (err: any) {
    console.error('Unexpected error enqueueing push notification:', err)
    return { enqueued: false, skippedReason: err?.message || 'internal_error' }
  }
}
