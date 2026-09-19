import { describe, expect, it } from 'vitest'
import { parseOneRosterCsv } from './csv'

describe('parseOneRosterCsv', () => {
  it('parses quoted values and hashes sourcedId', () => {
    const csv = [
      'sourcedId,status,dateLastModified,enabledUser,givenName,familyName,email',
      'u-1,active,2026-09-07T00:00:00Z,true,"Ana, Maria",Rivera,ana@example.test',
    ].join('\n')

    const result = parseOneRosterCsv('users', csv)

    expect(result.issues).toEqual([])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].rowNumber).toBe(2)
    expect(result.rows[0].sourcedId).toBe('u-1')
    expect(result.rows[0].sourcedIdHash).toHaveLength(64)
    expect(result.rows[0].data.givenName).toBe('Ana, Maria')
  })

  it('reports missing required headers without returning raw row content in the issue', () => {
    const csv = [
      'sourcedId,status,dateLastModified,givenName',
      'u-1,active,2026-09-07T00:00:00Z,Ana',
    ].join('\n')

    const result = parseOneRosterCsv('users', csv)

    expect(result.issues.map((issue) => issue.code)).toContain('missing_required_header')
    expect(JSON.stringify(result.issues)).not.toContain('Ana')
  })
})
