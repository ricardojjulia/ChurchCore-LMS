import { describe, it, expect } from 'vitest'
import { parseCsv } from './parse-csv'

// ── helpers ────────────────────────────────────────────────────────────────────

function csvOf(rows: string[]): string {
  return ['email,display_name,role', ...rows].join('\n')
}

const VALID_ROW = 'alice@example.com,Alice Smith,student'

// ── header validation ──────────────────────────────────────────────────────────

describe('parseCsv — header validation', () => {
  it('returns a header-missing error when the file is empty', () => {
    const result = parseCsv('')
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].rowNum).toBe(0)
    expect(result.errors[0].message).toMatch(/empty/i)
  })

  it('returns error for missing required column (role)', () => {
    const result = parseCsv('email,display_name\nalice@example.com,Alice')
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].rowNum).toBe(0)
    expect(result.errors[0].message).toMatch(/Missing required column/i)
    expect(result.errors[0].message).toContain('role')
  })

  it('returns errors for all missing required columns', () => {
    const result = parseCsv('name\nAlice')
    expect(result.errors[0].message).toContain('email')
    expect(result.errors[0].message).toContain('display_name')
    expect(result.errors[0].message).toContain('role')
  })

  it('accepts headers in any case (case-insensitive)', () => {
    const result = parseCsv('EMAIL,Display_Name,ROLE\nalice@example.com,Alice,student')
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })

  it('trims whitespace from header names', () => {
    const result = parseCsv(' email , display_name , role \nalice@example.com,Alice,student')
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })

  it('skips blank lines before the header', () => {
    const result = parseCsv('\n\nemail,display_name,role\nalice@example.com,Alice,student')
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })
})

// ── happy path ─────────────────────────────────────────────────────────────────

describe('parseCsv — happy path', () => {
  it('parses a single valid row', () => {
    const result = parseCsv(csvOf([VALID_ROW]))
    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toEqual({
      email: 'alice@example.com',
      display_name: 'Alice Smith',
      role: 'student',
      rowNum: 1,
    })
  })

  it('parses all valid roles', () => {
    const roles = ['admin', 'manager', 'teacher', 'student', 'guardian']
    const lines = roles.map((r, i) => `user${i}@x.com,User ${i},${r}`)
    const result = parseCsv(csvOf(lines))
    expect(result.errors).toHaveLength(0)
    expect(result.rows).toHaveLength(roles.length)
  })

  it('trims whitespace from field values', () => {
    const result = parseCsv(csvOf([' alice@example.com , Alice Smith , student ']))
    expect(result.rows[0].email).toBe('alice@example.com')
    expect(result.rows[0].display_name).toBe('Alice Smith')
    expect(result.rows[0].role).toBe('student')
  })

  it('handles \\r\\n line endings', () => {
    const result = parseCsv('email,display_name,role\r\nalice@example.com,Alice,student')
    expect(result.rows).toHaveLength(1)
    expect(result.errors).toHaveLength(0)
  })

  it('skips blank lines between data rows', () => {
    const result = parseCsv(
      'email,display_name,role\nalice@example.com,Alice,student\n\nbob@example.com,Bob,teacher',
    )
    expect(result.rows).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('assigns correct 1-based rowNum to each data row', () => {
    const result = parseCsv(
      csvOf(['alice@example.com,Alice,student', 'bob@example.com,Bob,teacher']),
    )
    expect(result.rows[0].rowNum).toBe(1)
    expect(result.rows[1].rowNum).toBe(2)
  })
})

// ── validation failures ────────────────────────────────────────────────────────

describe('parseCsv — validation failures', () => {
  it('rejects an invalid email and does not push to rows', () => {
    const result = parseCsv(csvOf(['not-an-email,Alice,student']))
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].rowNum).toBe(1)
    expect(result.errors[0].message).toMatch(/Invalid email/i)
  })

  it('rejects an email missing the domain extension', () => {
    const result = parseCsv(csvOf(['alice@example,Alice,student']))
    expect(result.rows).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
  })

  it('rejects an empty display_name', () => {
    const result = parseCsv(csvOf(['alice@example.com,,student']))
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].message).toMatch(/display_name is required/i)
  })

  it('rejects an invalid role', () => {
    const result = parseCsv(csvOf(['alice@example.com,Alice,superadmin']))
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].message).toMatch(/Invalid role/i)
    expect(result.errors[0].message).toContain('superadmin')
  })

  it('combines multiple field errors into one error entry per row', () => {
    const result = parseCsv(csvOf(['not-email,,badRole']))
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].message).toContain('Invalid email')
    expect(result.errors[0].message).toContain('display_name is required')
    expect(result.errors[0].message).toContain('Invalid role')
  })

  it('collects errors for invalid rows and still returns valid rows', () => {
    const result = parseCsv(
      csvOf(['alice@example.com,Alice,student', 'not-email,Bob,teacher']),
    )
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].email).toBe('alice@example.com')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].rowNum).toBe(2)
  })
})

// ── 50-row limit ───────────────────────────────────────────────────────────────

describe('parseCsv — row limit', () => {
  it('accepts exactly 50 rows without errors', () => {
    const lines = Array.from(
      { length: 50 },
      (_, i) => `user${i}@example.com,User ${i},student`,
    )
    const result = parseCsv(csvOf(lines))
    expect(result.rows).toHaveLength(50)
    expect(result.errors).toHaveLength(0)
  })

  it('adds a limit error for rows 51+', () => {
    const lines = Array.from(
      { length: 52 },
      (_, i) => `user${i}@example.com,User ${i},student`,
    )
    const result = parseCsv(csvOf(lines))
    expect(result.rows).toHaveLength(50)
    // Rows 51 and 52 each get an error
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0].message).toMatch(/50-row limit/i)
    expect(result.errors[0].rowNum).toBe(51)
    expect(result.errors[1].rowNum).toBe(52)
  })
})
