import { parse } from 'csv-parse/sync'
import { hashSourcedId } from './hash'
import { ONEROSTER_REQUIRED_HEADERS } from './schema'
import type { OneRosterFileType, OneRosterIssue, OneRosterRow } from './types'

export function parseOneRosterCsv(
  fileType: OneRosterFileType,
  text: string,
): { rows: OneRosterRow[]; issues: OneRosterIssue[] } {
  const issues: OneRosterIssue[] = []

  let records: Record<string, string>[]
  try {
    records = parse(text, {
      bom: true,
      columns: true,
      skip_empty_lines: true,
      relax_column_count: false,
      trim: true,
    }) as Record<string, string>[]
  } catch {
    return {
      rows: [],
      issues: [{
        severity: 'error',
        code: 'csv_parse_failed',
        message: 'CSV file could not be parsed.',
        fileType,
      }],
    }
  }

  const headers = extractHeaders(text)
  const required = ONEROSTER_REQUIRED_HEADERS[fileType]
  for (const header of required) {
    if (!headers.includes(header)) {
      issues.push({
        severity: 'error',
        code: 'missing_required_header',
        message: `Missing required header: ${header}`,
        fileType,
      })
    }
  }

  const rows = records.map((record, index) => {
    const sourcedId = record.sourcedId?.trim() || undefined
    return {
      fileType,
      rowNumber: index + 2,
      sourcedId,
      sourcedIdHash: sourcedId ? hashSourcedId(sourcedId) : undefined,
      data: normalizeRecord(record),
    }
  })

  return { rows, issues }
}

function extractHeaders(text: string): string[] {
  const firstLine = text.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? ''
  return firstLine.split(',').map((header) => header.trim().replace(/^"|"$/g, ''))
}

function normalizeRecord(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.trim(), String(value ?? '').trim()]),
  )
}
