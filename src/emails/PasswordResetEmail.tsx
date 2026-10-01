import * as React from 'react'

// Password reset link (COUNCIL-2026-045). Sent by /api/auth/forgot only to
// an address that has an account; the request's answer never says which.
interface Props {
  actionUrl: string
  locale:    'en' | 'es' | 'pt'
}

const COPY = {
  en: {
    title: 'Reset your password',
    body: 'Someone (hopefully you) asked to reset the password for your ChurchCore LMS account. Click below to choose a new one.',
    button: 'Choose a new password',
    footer: "This link expires in 1 hour and works once. If you didn't ask for this, you can ignore this email — your password hasn't changed.",
  },
  es: {
    title: 'Restablece tu contraseña',
    body: 'Alguien (esperamos que tú) pidió restablecer la contraseña de tu cuenta de ChurchCore LMS. Haz clic abajo para elegir una nueva.',
    button: 'Elegir una nueva contraseña',
    footer: 'Este enlace vence en 1 hora y funciona una sola vez. Si no lo pediste, puedes ignorar este correo: tu contraseña no ha cambiado.',
  },
  pt: {
    title: 'Redefina sua senha',
    body: 'Alguém (esperamos que você) solicitou a redefinição da senha da sua conta ChurchCore LMS. Clique abaixo para escolher uma nova.',
    button: 'Escolher uma nova senha',
    footer: 'Este link expira em 1 hora e funciona apenas uma vez. Se você não solicitou isso, ignore este e-mail — sua senha não foi alterada.',
  },
}

export default function PasswordResetEmail({ actionUrl, locale }: Props) {
  const c = COPY[locale]
  return (
    <html lang={locale}>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px' }}>{c.title}</h1>
        <p style={{ color: '#475569', margin: '0 0 28px', lineHeight: 1.6 }}>{c.body}</p>
        <a
          href={actionUrl}
          style={{ display: 'inline-block', background: '#4f46e5', color: '#fff', fontWeight: 600, padding: '12px 24px', borderRadius: 8, textDecoration: 'none', fontSize: 15 }}
        >
          {c.button}
        </a>
        <p style={{ color: '#64748b', fontSize: 13, marginTop: 32 }}>{c.footer}</p>
      </body>
    </html>
  )
}
