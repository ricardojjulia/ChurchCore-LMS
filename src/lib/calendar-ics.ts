/**
 * Generates an RFC 5545 iCalendar (.ics) string for a course session or meeting schedule.
 */

export interface CalendarEventInput {
  title:        string
  description?: string
  location?:    string
  startDate:    Date
  endDate:      Date
  url?:         string
}

export function generateIcsFile(events: CalendarEventInput[]): string {
  function formatDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ChurchCore LMS//Live Class Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  for (const ev of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${crypto.randomUUID()}@churchcore.lms`,
      `DTSTAMP:${formatDate(new Date())}`,
      `DTSTART:${formatDate(ev.startDate)}`,
      `DTEND:${formatDate(ev.endDate)}`,
      `SUMMARY:${ev.title.replace(/,/g, '\\,')}`,
      ev.description ? `DESCRIPTION:${ev.description.replace(/\n/g, '\\n').replace(/,/g, '\\,')}` : '',
      ev.location ? `LOCATION:${ev.location.replace(/,/g, '\\,')}` : '',
      ev.url ? `URL:${ev.url}` : '',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.filter(Boolean).join('\r\n')
}

export function downloadIcs(filename: string, events: CalendarEventInput[]) {
  const icsContent = generateIcsFile(events)
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename.endsWith('.ics') ? filename : `${filename}.ics`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
