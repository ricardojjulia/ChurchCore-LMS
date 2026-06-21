import { Resend } from 'resend'
import { env } from '@/env'

const resend = new Resend(env.resendApiKey)

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string | string[]
  subject: string
  react: React.ReactElement
}) {
  const { error } = await resend.emails.send({
    from:    env.emailFrom,
    to:      Array.isArray(to) ? to : [to],
    subject,
    react,
    headers: { 'X-Entity-Ref-ID': String(Date.now()) },
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}
