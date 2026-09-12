import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { readOneRosterZip } from './zip'

describe('readOneRosterZip', () => {
  it('reads allowed OneRoster CSV files', async () => {
    const zip = new JSZip()
    zip.file('manifest.csv', 'propertyName,value\nmanifest.version,1.2')
    zip.file('users.csv', 'sourcedId,status,dateLastModified,enabledUser,givenName,familyName\nu-1,active,,true,Ana,Rivera')

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const result = await readOneRosterZip(buffer)

    expect(result.issues).toEqual([])
    expect(result.files.map((file) => file.filename).sort()).toEqual(['manifest.csv', 'users.csv'])
  })

  it('rejects unsafe paths and nested archives', async () => {
    const zip = new JSZip()
    zip.file('../users.csv', 'bad')
    zip.file('nested.zip', 'bad')
    zip.file('manifest.csv', 'propertyName,value\nmanifest.version,1.2')

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const result = await readOneRosterZip(buffer)

    expect(result.issues.map((issue) => issue.code)).toContain('unsafe_zip_path')
    expect(result.issues.map((issue) => issue.code)).toContain('nested_archive_rejected')
  })

  it('requires manifest.csv', async () => {
    const zip = new JSZip()
    zip.file('users.csv', 'sourcedId,status,dateLastModified,enabledUser,givenName,familyName\nu-1,active,,true,Ana,Rivera')

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const result = await readOneRosterZip(buffer)

    expect(result.issues.map((issue) => issue.code)).toContain('missing_manifest')
  })
})
