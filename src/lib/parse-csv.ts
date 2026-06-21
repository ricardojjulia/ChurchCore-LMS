// Pure CSV parser — no imports, no external packages.
// Safe to run in both browser and server environments.

export interface CsvRow {
  email: string
  display_name: string
  role: string
  rowNum: number
}

export interface ParseError {
  rowNum: number
  message: string
}

export interface ParseResult {
  rows: CsvRow[]
  errors: ParseError[]
}

const VALID_ROLES = ['admin', 'manager', 'teacher', 'student', 'guardian'] as const
const MAX_ROWS = 50

// Note: display_name values must not contain commas, because CSV fields are
// comma-delimited. The UI shows a note instructing users to avoid commas in
// names. We do not add a validator here — a mis-parsed row will fail the
// non-empty display_name check or produce an obviously wrong email/role value,
// surfacing the issue to the user without a confusing dedicated error.

export function parseCsv(text: string): ParseResult {
  const rows: CsvRow[] = []
  const errors: ParseError[] = []

  // Split on \r\n or \n, keeping the empty-line filter below
  const lines = text.split(/\r?\n/)

  // Collect non-empty lines so we can find the header row cleanly
  const nonEmptyLines: { original: string; lineIndex: number }[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      nonEmptyLines.push({ original: lines[i], lineIndex: i })
    }
  }

  if (nonEmptyLines.length === 0) {
    errors.push({ rowNum: 0, message: 'File is empty.' })
    return { rows, errors }
  }

  // First non-empty line is the header row
  const headerLine = nonEmptyLines[0].original
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase())

  const emailIdx       = headers.indexOf('email')
  const displayNameIdx = headers.indexOf('display_name')
  const roleIdx        = headers.indexOf('role')

  const missingHeaders: string[] = []
  if (emailIdx === -1)        missingHeaders.push('email')
  if (displayNameIdx === -1)  missingHeaders.push('display_name')
  if (roleIdx === -1)         missingHeaders.push('role')

  if (missingHeaders.length > 0) {
    errors.push({
      rowNum: 0,
      message: `Missing required column: ${missingHeaders.join(', ')}`,
    })
    return { rows, errors }
  }

  // Data rows — 1-indexed for user display (row 1 = first data row after header)
  const dataLines = nonEmptyLines.slice(1)

  for (let i = 0; i < dataLines.length; i++) {
    const rowNum = i + 1 // 1-indexed

    if (rowNum > MAX_ROWS) {
      errors.push({
        rowNum,
        message: 'File exceeds 50-row limit. Split your file and import in batches.',
      })
      // Continue iterating so every offending row gets the error reported
      continue
    }

    const fields = dataLines[i].original.split(',').map((f) => f.trim())

    const email       = fields[emailIdx]       ?? ''
    const displayName = fields[displayNameIdx] ?? ''
    const role        = fields[roleIdx]        ?? ''

    const rowErrors: string[] = []

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowErrors.push('Invalid email address')
    }

    // Validate display_name
    if (!displayName) {
      rowErrors.push('display_name is required')
    }

    // Validate role
    if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
      rowErrors.push(
        `Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`,
      )
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNum, message: rowErrors.join('; ') })
    } else {
      rows.push({ email, display_name: displayName, role, rowNum })
    }
  }

  return { rows, errors }
}
