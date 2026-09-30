// Password rules for every place the app sets a password (COUNCIL-2026-045).
// Shared by server code and forms; no server-only imports.

export const PASSWORD_MIN = 8
// bcrypt, which Supabase Auth uses, ignores anything past 72 bytes.
export const PASSWORD_MAX = 72

// The most common passwords from public breach lists, plus church-flavoured
// ones this product's users are likely to pick. Compared case-insensitively.
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '12345678910', '87654321', '11111111', '00000000',
  '11223344', '12341234', '123123123', '1q2w3e4r', '1qaz2wsx', 'qwertyui', 'qwerty123',
  'qwertyuiop', 'asdfghjk', 'asdfasdf', 'zxcvbnm1', 'password', 'password1', 'password12',
  'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'iloveyou', 'iloveyou1', 'sunshine',
  'princess', 'football', 'baseball', 'basketball', 'superman', 'batman12', 'starwars',
  'welcome1', 'welcome123', 'letmein1', 'trustno1', 'whatever', 'computer', 'internet',
  'abc12345', 'abcd1234', 'aa123456', 'monkey12', 'dragon12', 'master12', 'shadow12',
  'michael1', 'jennifer', 'jordan23', 'charlie1', 'changeme', 'default1', 'admin123',
  'administrator', 'test1234', 'testing1', 'qazwsxedc', 'passpass', 'secret12',
  'jesus123', 'jesuschrist', 'jesusloves', 'jesuslovesme', 'jesusislord', 'jesussaves',
  'godisgood', 'godisgreat', 'godislove', 'godbless', 'godbless1', 'godblessyou',
  'blessed1', 'blessed123', 'blessing', 'blessings', 'faith123', 'faithful', 'christian',
  'christ123', 'hallelujah', 'praisegod', 'praisethelord', 'amazinggrace', 'grace123',
  'heaven12', 'church123', 'churchcore', 'churchcore1', 'john3:16', 'john316', 'john3161',
])

export type PasswordProblem = 'too_short' | 'too_long' | 'matches_email' | 'too_common'

export function checkPassword(password: string, email?: string | null): PasswordProblem | null {
  if (password.length < PASSWORD_MIN) return 'too_short'
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) return 'too_long'
  const lower = password.toLowerCase()
  if (email) {
    const e = email.trim().toLowerCase()
    if (lower === e || lower === e.split('@')[0]) return 'matches_email'
  }
  if (COMMON.has(lower)) return 'too_common'
  return null
}

export const PASSWORD_MESSAGES: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN} characters.`,
  too_long: `Use at most ${PASSWORD_MAX} characters.`,
  matches_email: 'Don’t use your email address as your password.',
  too_common: 'That password is too common. Choose something harder to guess.',
}

// Sessions opened from a reset or one-time link in the last 30 minutes may set
// a password without the current one (COUNCIL-2026-045 Amendment 3). This
// covers reset links and admins from /start, who never had a password.
const LINK_METHODS = new Set(['recovery', 'otp', 'magiclink'])
export const LINK_GRACE_SECONDS = 30 * 60

export function linkSessionIsFresh(amr: unknown, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!Array.isArray(amr)) return false
  return amr.some((a) => {
    const entry = a as { method?: string; timestamp?: number }
    return LINK_METHODS.has(entry?.method ?? '') && typeof entry.timestamp === 'number'
      && nowSeconds - entry.timestamp <= LINK_GRACE_SECONDS
  })
}
