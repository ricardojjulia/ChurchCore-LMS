import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

// Rate limiters are disabled gracefully when Upstash env vars are not set.
// In that case, all requests are allowed through (dev fallback).
function makeRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

const redis = makeRedis()

function makeLimiter(prefix: string, requests: number, windowSeconds: number) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter:   Ratelimit.slidingWindow(requests, `${windowSeconds} s`),
    prefix:    `rl:ai:${prefix}`,
    analytics: false,
  })
}

// 20 req / 60 s per user — conversational AI tutor
export const tutorLimiter  = makeLimiter('tutor',  20, 60)

// 5 req / 60 s per user — heavier analysis routes
export const heavyLimiter   = makeLimiter('heavy',    5,    60)

// 5 req / 3600 s per user — AI outline generator (expensive inference)
export const outlineLimiter = makeLimiter('outline',  5, 3600)

export interface RateLimitResult {
  limited:   boolean
  retryAfter: number  // seconds
  limit:     number
  remaining: number
}

export async function checkLimit(
  limiter: Ratelimit | null,
  userId:  string
): Promise<RateLimitResult> {
  if (!limiter) return { limited: false, retryAfter: 0, limit: 0, remaining: 999 }
  const { success, limit, remaining, reset } = await limiter.limit(userId)
  return {
    limited:    !success,
    retryAfter: Math.ceil((reset - Date.now()) / 1000),
    limit,
    remaining,
  }
}
