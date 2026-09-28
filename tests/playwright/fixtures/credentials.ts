// Helpers for the password sign-in tests (COUNCIL-2026-045).
import { createHash, randomInt, randomUUID } from 'node:crypto'
import { ORG_A } from './data'
import { db, runTag } from './db'

export const suiteEmail = () =>
  `suite-${runTag().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}@test.churchcore.dev`

// A distinct client address per test, so per-IP limits don't couple tests
// that all run from 127.0.0.1. Vercel overwrites this header in production.
export const testIp = () => `198.18.${randomInt(0, 255)}.${randomInt(1, 254)}`

export async function createMember(email = suiteEmail()) {
  const password = `Suite-${randomUUID()}`
  const { data, error } = await db().auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { display_name: 'Suite Credentials User' },
    app_metadata: { org_id: ORG_A, role: 'student' },
  })
  if (error) throw error
  return { id: data.user!.id, email, password }
}

// Same key shape as src/lib/auth-throttle.ts: `${scope}|${kind}:${sha256}`.
export function throttleKey(scope: string, kind: 'ip' | 'email', value: string) {
  return `${scope}|${kind}:` + createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

export async function fillThrottle(key: string, hits: number) {
  const { error } = await db().from('auth_throttle').upsert({ key, hits, window_start: new Date().toISOString() })
  if (error) throw error
}

export async function recoveryTokenHash(email: string) {
  const { data, error } = await db().auth.admin.generateLink({ type: 'recovery', email })
  if (error) throw error
  return data.properties.hashed_token
}
