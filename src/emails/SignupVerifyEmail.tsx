import * as React from 'react'

// Self-serve signup emails (COUNCIL-2026-034). "verify" confirms a new
// church; "existing" goes to an address that already has an account, so the
// signup response never reveals whether an email is registered.
interface Props {
  variant:   'verify' | 'existing'
  churchName: string
  actionUrl: string
  locale:    'en' | 'es'
}

const COPY = {
  en: {
    verifyTitle: (c: string) => `Confirm your email to create ${c}`,
    verifyBody: 'Click below to confirm your email address. Your church and its 14-day free trial are created as soon as you do.',
    verifyButton: 'Confirm and create my church',
    existingTitle: 'You already have a ChurchCore LMS account',
    existingBody: 'Someone (hopefully you) tried to start a new church with this email address. You already have an account, so sign in instead.',
    existingButton: 'Sign in',
    footer: "This link expires in 24 hours. If you didn't request this, you can ignore this email.",
  },
  es: {
    verifyTitle: (c: string) => `Confirma tu correo para crear ${c}`,
    verifyBody: 'Haz clic abajo para confirmar tu correo. Tu iglesia y su prueba gratuita de 14 días se crean en cuanto lo hagas.',
    verifyButton: 'Confirmar y crear mi iglesia',
    existingTitle: 'Ya tienes una cuenta de ChurchCore LMS',
    existingBody: 'Alguien (esperamos que tú) intentó crear una nueva iglesia con este correo. Ya tienes una cuenta, así que inicia sesión.',
    existingButton: 'Iniciar sesión',
    footer: 'Este enlace vence en 24 horas. Si no lo solicitaste, puedes ignorar este correo.',
  },
}

export default function SignupVerifyEmail({ variant, churchName, actionUrl, locale }: Props) {
  const c = COPY[locale]
  const title = variant === 'verify' ? c.verifyTitle(churchName) : c.existingTitle
  const body = variant === 'verify' ? c.verifyBody : c.existingBody
  const button = variant === 'verify' ? c.verifyButton : c.existingButton
  return (
    <html lang={locale}>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>{title}</h1>
        <p style={{ color: '#475569', margin: '0 0 28px', lineHeight: 1.6 }}>{body}</p>
        <a
          href={actionUrl}
          style={{ display: 'inline-block', background: '#4f46e5', color: '#fff', fontWeight: 600, padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontSize: 15 }}
        >
          {button}
        </a>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 32 }}>{c.footer}</p>
      </body>
    </html>
  )
}
