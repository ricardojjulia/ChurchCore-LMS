import crypto from 'crypto'
import type { PodcastTokenPayload } from './types'

function getFeedSecret(): string {
  return process.env.PODCAST_FEED_SECRET || process.env.SUPABASE_JWT_SECRET || 'churchcore_podcast_feed_secret_default_key'
}

/**
 * Generates a URL-safe signed token representing a user's enrollment feed access.
 */
export function generatePodcastToken(payload: Omit<PodcastTokenPayload, 'issuedAt'>): string {
  const fullPayload: PodcastTokenPayload = {
    ...payload,
    issuedAt: Date.now(),
  }

  const jsonStr = JSON.stringify(fullPayload)
  const encodedPayload = Buffer.from(jsonStr).toString('base64url')

  const signature = crypto
    .createHmac('sha256', getFeedSecret())
    .update(encodedPayload)
    .digest('base64url')

  return `${encodedPayload}.${signature}`
}

/**
 * Verifies and decodes a podcast feed token. Returns null if invalid or tampered.
 */
export function verifyPodcastToken(token: string): PodcastTokenPayload | null {
  if (!token || typeof token !== 'string') return null

  const parts = token.split('.')
  if (parts.length !== 2) return null

  const [encodedPayload, signature] = parts

  const expectedSignature = crypto
    .createHmac('sha256', getFeedSecret())
    .update(encodedPayload)
    .digest('base64url')

  const sigBuf = Buffer.from(signature)
  const expBuf = Buffer.from(expectedSignature)

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null
  }

  try {
    const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf-8')
    const payload = JSON.parse(jsonStr) as PodcastTokenPayload

    if (!payload.enrollmentId || !payload.courseId || !payload.userId) {
      return null
    }

    return payload
  } catch {
    return null
  }
}
