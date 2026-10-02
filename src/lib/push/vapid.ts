import webpush from 'web-push'

// Fallback VAPID keys for local dev / test environments if environment variables are not set
const DEFAULT_DEV_VAPID_PUBLIC = 'BK3v4_sN7Y44q5_xHj3Y4L1_23y7Nq8q7e3F_jH9t4u3E7_r6u5i4o3p2a1s0d_f8g7h6j5k4l3z2x1c0v9b8n7m6=='
const DEFAULT_DEV_VAPID_PRIVATE = 'v8n7m6l5k4j3h2g1f0d9s8a7p6o5i4u3y2t1r0e9w8q'
const DEFAULT_DEV_SUBJECT = 'mailto:support@churchcore.app'

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || DEFAULT_DEV_VAPID_PUBLIC
}

export function getVapidPrivateKey(): string {
  return process.env.VAPID_PRIVATE_KEY || DEFAULT_DEV_VAPID_PRIVATE
}

export function getVapidSubject(): string {
  return process.env.VAPID_SUBJECT || DEFAULT_DEV_SUBJECT
}

export function configureWebPush(): void {
  try {
    webpush.setVapidDetails(
      getVapidSubject(),
      getVapidPublicKey(),
      getVapidPrivateKey()
    )
  } catch (err) {
    console.warn('Warning: WebPush VAPID configuration failed:', err)
  }
}
