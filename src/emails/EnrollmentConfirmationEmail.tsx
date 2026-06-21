import * as React from 'react'

interface Props {
  orgName:      string
  courseName:   string
  sectionCode:  string
  dashboardUrl: string
}

export default function EnrollmentConfirmationEmail({ orgName, courseName, sectionCode, dashboardUrl }: Props) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          You're enrolled!
        </h1>
        <p style={{ color: '#475569', marginBottom: 24 }}>
          You've been enrolled in <strong>{courseName}</strong>
          {sectionCode ? ` (Section ${sectionCode})` : ''} at <strong>{orgName}</strong>.
          Head to your dashboard to get started.
        </p>

        <a
          href={dashboardUrl}
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
          Go to My Dashboard
        </a>

        <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 32 }}>
          Sent by ChurchCore LMS on behalf of {orgName}.
        </p>
      </body>
    </html>
  )
}
