'use client'

import { forwardRef, useImperativeHandle, useRef } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'

// Cloudflare Turnstile for the sign-in and password-reset forms
// (COUNCIL-2026-045). Renders nothing when the site has no key, matching the
// server, which skips the check in that case. Tokens are single-use: call
// reset() after every submit so the next attempt gets a fresh one.
export const BOT_CHECK_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)

export interface BotCheckHandle { reset: () => void }

const BotCheck = forwardRef<BotCheckHandle, { onToken: (token: string | null) => void; dark?: boolean }>(
  function BotCheck({ onToken, dark }, ref) {
    const widget = useRef<TurnstileInstance | null>(null)
    useImperativeHandle(ref, () => ({
      reset: () => { onToken(null); widget.current?.reset() },
    }), [onToken])
    if (!BOT_CHECK_ENABLED) return null
    return (
      <Turnstile
        ref={widget}
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''}
        options={{ theme: dark ? 'dark' : 'light', size: 'flexible' }}
        onSuccess={onToken}
        onExpire={() => onToken(null)}
        onError={() => onToken(null)}
      />
    )
  },
)
export default BotCheck
