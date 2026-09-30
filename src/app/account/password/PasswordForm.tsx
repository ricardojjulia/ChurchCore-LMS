'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { updatePassword } from '@/app/actions/account'
import { PASSWORD_MIN, PASSWORD_MAX } from '@/lib/password-policy'

const inputClass = 'mt-1 w-full rounded-md border border-input px-3 py-2 text-sm'

export default function PasswordForm({ needsCurrent }: { needsCurrent: boolean }) {
  const t = useTranslations('auth.password')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Uncontrolled inputs, read on submit: text typed before hydration stays.
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setMessage(null)
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const current = String(form.get('current') ?? '')
    const password = String(form.get('password') ?? '')
    const confirm = String(form.get('confirm') ?? '')
    if (password !== confirm) { setMessage({ kind: 'error', text: t('mismatch') }); return }
    startTransition(async () => {
      const res = await updatePassword({ current: needsCurrent ? current : undefined, password })
      if (res.error) {
        setMessage({ kind: 'error', text: t(`errors.${res.error}`) })
        return
      }
      formEl.reset()
      setMessage({ kind: 'ok', text: t('saved') })
    })
  }

  return (
    <form onSubmit={submit} method="post" className="space-y-4">
      {needsCurrent && (
        <div>
          <label htmlFor="current-password" className="block text-sm font-semibold text-slate-800">{t('current')}</label>
          <input id="current-password" type="password" autoComplete="current-password" required
            name="current" className={inputClass} />
        </div>
      )}
      <div>
        <label htmlFor="new-password" className="block text-sm font-semibold text-slate-800">{t('new')}</label>
        <input id="new-password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
          name="password" className={inputClass} />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-800">{t('confirm')}</label>
        <input id="confirm-password" type="password" autoComplete="new-password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX}
          name="confirm" className={inputClass} />
      </div>
      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${message.kind === 'error' ? 'text-rose-700' : 'text-emerald-800'}`}>
          {message.text}
        </p>
      )}
      <button type="submit" disabled={pending}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60">
        {pending ? t('saving') : t('submit')}
      </button>
    </form>
  )
}
