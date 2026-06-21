import { Resend } from 'resend'
import { env } from '@/env'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!env.resendApiKey) throw new Error('RESEND_API_KEY is not set')
  if (!_resend) _resend = new Resend(env.resendApiKey)
  return _resend
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[]
  subject: string
  react: React.ReactElement
}) {
  const { error } = await getResend().emails.send({
    from:    env.emailFrom || 'ChurchCore LMS <noreply@churchcore.app>',
    to:      Array.isArray(to) ? to : [to],
    subject,
    react,
    headers: { 'X-Entity-Ref-ID': String(Date.now()) },
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}
