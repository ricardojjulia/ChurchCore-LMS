import * as React from 'react'

interface Props {
  userName:         string
  badgeName:        string
  badgeDescription: string
  dashboardUrl:     string
}

export default function BadgeAwardEmail({ userName, badgeName, badgeDescription, dashboardUrl }: Props) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🏅</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            New badge earned!
          </h1>
          <p style={{ color: '#64748b', margin: 0 }}>
            Congratulations, {userName}
          </p>
        </div>

        <div
          style={{
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: 12,
            padding: '20px 24px',
            textAlign: 'center',
            marginBottom: 28,
          }}
        >
          <p style={{ fontWeight: 700, fontSize: 18, margin: '0 0 6px', color: '#7c3aed' }}>
            {badgeName}
          </p>
          <p style={{ color: '#6b7280', fontSize: 14, margin: 0 }}>
            {badgeDescription}
          </p>
        </div>

        <div style={{ textAlign: 'center' }}>
          <a
            href={dashboardUrl}
            style={{
              display: 'inline-block',
              background: '#7c3aed',
              color: '#fff',
              fontWeight: 600,
              padding: '12px 24px',
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            View Your Badges
          </a>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 32, textAlign: 'center' }}>
          Sent by ChurchCore LMS
        </p>
      </body>
    </html>
  )
}
