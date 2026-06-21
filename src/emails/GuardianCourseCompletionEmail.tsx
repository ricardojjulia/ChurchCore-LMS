import * as React from 'react'

interface Props {
  guardianName:   string
  studentName:    string
  courseTitle:    string
  portalUrl:      string
  unsubscribeUrl: string
}

export default function GuardianCourseCompletionEmail({
  guardianName,
  studentName,
  courseTitle,
  portalUrl,
  unsubscribeUrl,
}: Props) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, sans-serif', color: '#1e293b', maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px' }}>
            {studentName} completed a course!
          </h1>
          <p style={{ color: '#64748b', margin: 0 }}>
            Hi {guardianName}
          </p>
        </div>

        <div
          style={{
            background: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: 12,
            padding: '20px 24px',
            marginBottom: 28,
          }}
        >
          <p style={{ color: '#334155', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Great news — {studentName} has just completed <strong style={{ color: '#7c3aed' }}>{courseTitle}</strong>.
            Keep encouraging their learning journey!
          </p>
        </div>

        <div style={{ textAlign: 'center' }}>
          <a
            href={portalUrl}
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
            View Progress
          </a>
        </div>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 32, textAlign: 'center' }}>
          You&apos;re receiving this as a linked guardian.{' '}
          <a href={unsubscribeUrl} style={{ color: '#94a3b8' }}>
            Unsubscribe
          </a>
        </p>
      </body>
    </html>
  )
}
