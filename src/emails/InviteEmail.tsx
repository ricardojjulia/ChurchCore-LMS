import * as React from 'react'

interface Props {
  orgName:    string
  inviteUrl:  string
  role:       string
}

export default function InviteEmail({ orgName, inviteUrl, role }: Props) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
            You've been invited to {orgName}
          </h1>
          <p style={{ color: '#64748b', margin: 0 }}>
            You've been added as a <strong>{role}</strong> on ChurchCore LMS.
            Click below to accept your invitation and create your account.
          </p>
        </div>

        <a
          href={inviteUrl}
          style={{
            display: 'inline-block',
            background: '#4f46e5',
            color: '#fff',
            fontWeight: 600,
            padding: '12px 24px',
            borderRadius: 8,
            textDecoration: 'none',
            fontSize: 15,
          }}
        >
          Accept Invitation
        </a>

        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 32 }}>
          This link expires in 24 hours. If you didn't expect this email, you can safely ignore it.
        </p>
      </body>
    </html>
  )
}
