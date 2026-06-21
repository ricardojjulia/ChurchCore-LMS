import * as React from 'react'

interface Props {
  userName:          string
  summaryText:       string
  coursesInProgress: number
  dashboardUrl:      string
}

export default function WeeklySummaryEmail({ userName, summaryText, coursesInProgress, dashboardUrl }: Props) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Your weekly learning summary
        </h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Hi {userName} — here's what's been happening in your courses this week.
          {coursesInProgress > 0 && ` You have ${coursesInProgress} course${coursesInProgress > 1 ? 's' : ''} in progress.`}
        </p>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '20px 24px',
            marginBottom: 28,
            fontSize: 14,
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            color: '#334155',
          }}
        >
          {summaryText}
        </div>

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
          Continue Learning
        </a>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 32 }}>
          You're receiving this because you opted in to weekly summaries.
          Update your preferences in your profile settings.
        </p>
      </body>
    </html>
  )
}
