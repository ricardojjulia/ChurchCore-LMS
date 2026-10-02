// Web Push Types (COUNCIL-2026-040)

export type PushEventType =
  | 'announcement'
  | 'grade_posted'
  | 'new_message'
  | 'course_completed'
  | 'live_session_starting'
  | 'streak_reminder'
  | 'test_push'

export interface PushNotificationPrefs {
  announcement: boolean
  grade_posted: boolean
  new_message: boolean
  course_completed: boolean
  live_session_starting: boolean
  streak_reminder: boolean
}

export const DEFAULT_PUSH_PREFS: PushNotificationPrefs = {
  announcement: true,
  grade_posted: true,
  new_message: true,
  course_completed: true,
  live_session_starting: true,
  streak_reminder: false,
}

export interface WebPushSubscriptionKeys {
  p256dh: string
  auth: string
}

export interface WebPushSubscription {
  endpoint: string
  keys: WebPushSubscriptionKeys
}

export interface PushPayload {
  title: string
  body: string
  deep_link: string
  icon?: string
  badge?: string
}

export interface EnqueuePushOptions {
  orgId: string
  userId: string
  eventType: PushEventType
  title: string
  body: string
  deepLink: string
}
