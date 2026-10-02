import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { configureWebPush } from './vapid'

export interface DispatchSummary {
  processed: number
  delivered: number
  failed: number
  prunedSubscriptions: number
}

export async function drainPushQueue(
  supabase: SupabaseClient,
  batchSize = 25
): Promise<DispatchSummary> {
  configureWebPush()

  const summary: DispatchSummary = {
    processed: 0,
    delivered: 0,
    failed: 0,
    prunedSubscriptions: 0,
  }

  // 1. Fetch pending notifications
  const { data: pendingNotifications, error: fetchErr } = await supabase
    .from('push_notification_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('next_retry_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (fetchErr || !pendingNotifications || pendingNotifications.length === 0) {
    return summary
  }

  for (const notif of pendingNotifications) {
    summary.processed++

    // Fetch user's push subscriptions
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', notif.user_id)
      .eq('org_id', notif.org_id)

    if (!subscriptions || subscriptions.length === 0) {
      // No active subscription devices for this user
      await supabase
        .from('push_notification_queue')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          error_message: 'No registered push devices; marked completed',
        })
        .eq('id', notif.id)
      continue
    }

    const payload = JSON.stringify({
      title: notif.title,
      body: notif.body,
      deep_link: notif.deep_link,
      icon: '/icons/icon-192x192.png',
    })

    let anySucceeded = false
    let lastError: string | null = null

    for (const sub of subscriptions) {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }

      try {
        await webpush.sendNotification(pushSubscription, payload)
        anySucceeded = true
      } catch (err: any) {
        const statusCode = err?.statusCode

        // Expired or unregistered subscription (410 / 404) -> Prune immediately (Amendment 4)
        if (statusCode === 410 || statusCode === 404) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('id', sub.id)
          summary.prunedSubscriptions++
        } else {
          lastError = err?.message || 'Push dispatch error'
        }
      }
    }

    if (anySucceeded) {
      summary.delivered++
      await supabase
        .from('push_notification_queue')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', notif.id)
    } else {
      summary.failed++
      const newAttempt = (notif.attempt_count || 0) + 1
      const isDeadLetter = newAttempt >= 3

      // Exponential backoff (1m, 5m, dead-letter)
      const delayMs = Math.pow(5, newAttempt) * 60 * 1000
      const nextRetry = new Date(Date.now() + delayMs).toISOString()

      await supabase
        .from('push_notification_queue')
        .update({
          status: isDeadLetter ? 'failed' : 'pending',
          attempt_count: newAttempt,
          next_retry_at: nextRetry,
          error_message: lastError,
        })
        .eq('id', notif.id)
    }
  }

  return summary
}
