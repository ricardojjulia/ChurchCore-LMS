import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { validateOneRosterPackage } from './validate'
import { readOneRosterZip } from './zip'
import type { OneRosterPackageText } from './types'

interface AcademyFixtureMetadata {
  name: string
  standard: string
  version: string
  profile: string
  packageHash: string
  files: Array<{ filename: string; sha256: string; bytes: number }>
}

describe('Academy OneRoster export contract', () => {
  it('validates the generated Academy fixture artifact without manual edits', () => {
    const { files, metadata } = readAcademyFixture()

    expect(metadata.name).toBe('churchcore-academy-rostering-v1')
    expect(metadata.standard).toBe('OneRoster')
    expect(metadata.version).toBe('1.2')
    expect(metadata.profile).toBe('churchcore-oneroster-rostering-csv-provider')
    expect(packageHash(files, metadata.files)).toBe(metadata.packageHash)

    const result = validateOneRosterPackage(files)

    expect(result.valid).toBe(true)
    expect(result.preview.totalRows).toBe(23)
    expect(result.preview.quarantinedRows).toBe(0)
    expect(result.files.map((file) => file.fileType)).toEqual([
      'manifest',
      'orgs',
      'users',
      'roles',
      'academicSessions',
      'courses',
      'classes',
      'enrollments',
    ])
    expect(files.find((file) => file.filename === 'roles.csv')?.text).not.toContain('administrator')
    expect(files.find((file) => file.filename === 'enrollments.csv')?.text).toContain('tobedeleted')
    expect(JSON.stringify(result.files)).not.toMatch(/password|credentialSecret|accessToken|refreshToken|clientSecret|webhookSecret/i)
  })

  it('accepts the generated Academy fixture after ZIP packaging', async () => {
    const { files } = readAcademyFixture()
    const zip = new JSZip()
    for (const file of files) {
      zip.file(file.filename, file.text)
    }

    const buffer = await zip.generateAsync({ type: 'nodebuffer' })
    const extracted = await readOneRosterZip(buffer)
    const result = validateOneRosterPackage(extracted.files)

    expect(extracted.issues).toEqual([])
    expect(result.valid).toBe(true)
    expect(result.preview.totalRows).toBe(23)
  })

  it('accepts the Academy-shaped shared OneRoster package without manual edits', () => {
    const result = validateOneRosterPackage(academyPackage())

    expect(result.valid).toBe(true)
    expect(result.preview.totalRows).toBe(21)
    expect(result.preview.quarantinedRows).toBe(0)
    expect(result.files.map((file) => file.fileType)).toEqual([
      'manifest',
      'orgs',
      'users',
      'roles',
      'academicSessions',
      'courses',
      'classes',
      'enrollments',
    ])
    expect(JSON.stringify(result.files)).not.toMatch(/password|credentialSecret|accessToken|refreshToken|clientSecret|webhookSecret/i)
  })
})

function academyPackage(): OneRosterPackageText[] {
  return [
    {
      filename: 'manifest.csv',
      text: [
        'propertyName,value',
        'manifest.version,1.0',
        'oneroster.version,1.2',
        'file.orgs,delta',
        'file.users,delta',
        'file.roles,delta',
        'file.academicSessions,delta',
        'file.courses,delta',
        'file.classes,delta',
        'file.enrollments,delta',
      ].join('\n'),
    },
    {
      filename: 'orgs.csv',
      text: [
        'sourcedId,status,dateLastModified,name,type,identifier,parentSourcedId',
        'academy:org:tenant-1,active,2026-09-01T00:00:00.000Z,Example Academy,school,tenant-1,',
      ].join('\n'),
    },
    {
      filename: 'users.csv',
      text: [
        'sourcedId,status,dateLastModified,enabledUser,username,userIds,givenName,familyName,middleName,identifier,email,sms,phone,agents,orgSourcedIds,grades',
        'academy:person:person-student-1,active,2026-09-01T00:00:00.000Z,true,student@example.test,S-1001,Sam,Student,,S-1001,student@example.test,,,,academy:org:tenant-1,',
        'academy:person:person-teacher-1,active,2026-09-01T00:00:00.000Z,true,teacher@example.test,,Theo,Teacher,,,teacher@example.test,,,,academy:org:tenant-1,',
      ].join('\n'),
    },
    {
      filename: 'roles.csv',
      text: [
        'sourcedId,status,dateLastModified,userSourcedId,roleType,role,beginDate,endDate,orgSourcedId,userProfile',
        'academy:role:person-student-1:student,active,2026-09-01T00:00:00.000Z,academy:person:person-student-1,primary,student,,,academy:org:tenant-1,',
        'academy:role:person-teacher-1:teacher,active,2026-09-01T00:00:00.000Z,academy:person:person-teacher-1,primary,teacher,,,academy:org:tenant-1,',
      ].join('\n'),
    },
    {
      filename: 'academicSessions.csv',
      text: [
        'sourcedId,status,dateLastModified,title,type,startDate,endDate,parentSourcedId,schoolYear',
        'academy:academicYear:year-2026,active,2026-09-01T00:00:00.000Z,2026-2027,schoolYear,2026-08-01,2027-05-31,,2026',
        'academy:academicPeriod:period-fall,active,2026-09-01T00:00:00.000Z,Fall 2026,semester,2026-08-24,2026-12-12,academy:academicYear:year-2026,2026',
      ].join('\n'),
    },
    {
      filename: 'courses.csv',
      text: [
        'sourcedId,status,dateLastModified,schoolYearSourcedId,title,courseCode,grades,orgSourcedId,subjects,subjectCodes',
        'academy:course:course-bibl-101,active,2026-09-01T00:00:00.000Z,academy:academicYear:year-2026,Biblical Foundations,BIBL-101,,academy:org:tenant-1,,',
      ].join('\n'),
    },
    {
      filename: 'classes.csv',
      text: [
        'sourcedId,status,dateLastModified,title,classCode,classType,location,grades,courseSourcedId,schoolSourcedId,termSourcedIds,subjects,subjectCodes,periods',
        'academy:class:section-bibl-101-a,active,2026-09-01T00:00:00.000Z,Biblical Foundations,BIBL-101-A,scheduled,online,,academy:course:course-bibl-101,academy:org:tenant-1,academy:academicPeriod:period-fall,,,MWF',
      ].join('\n'),
    },
    {
      filename: 'enrollments.csv',
      text: [
        'sourcedId,status,dateLastModified,classSourcedId,schoolSourcedId,userSourcedId,role,primary,beginDate,endDate',
        'academy:enrollment:registration-active,active,2026-09-01T00:00:00.000Z,academy:class:section-bibl-101-a,academy:org:tenant-1,academy:person:person-student-1,student,,2026-08-24,',
        'academy:enrollment:registration-withdrawn,tobedeleted,2026-09-02T00:00:00.000Z,academy:class:section-bibl-101-a,academy:org:tenant-1,academy:person:person-student-1,student,,2026-08-25,',
        'academy:enrollment:section-bibl-101-a:teacher:person-teacher-1,active,2026-09-01T00:00:00.000Z,academy:class:section-bibl-101-a,academy:org:tenant-1,academy:person:person-teacher-1,teacher,true,,',
      ].join('\n'),
    },
  ]
}

function readAcademyFixture(): { files: OneRosterPackageText[]; metadata: AcademyFixtureMetadata } {
  const fixtureDir = process.env.ACADEMY_ONEROSTER_FIXTURE_DIR
    ?? localAcademyFixtureDir()
  expect(existsSync(fixtureDir), `Missing Academy OneRoster fixture directory: ${fixtureDir}`).toBe(true)

  const metadata = JSON.parse(readFileSync(path.join(fixtureDir, 'fixture.json'), 'utf8')) as AcademyFixtureMetadata
  const files = metadata.files.map((file) => {
    const text = readFileSync(path.join(fixtureDir, file.filename), 'utf8')
    expect(sha256(text)).toBe(file.sha256)
    expect(Buffer.byteLength(text)).toBe(file.bytes)
    return { filename: file.filename, text }
  })
  return { files, metadata }
}

function localAcademyFixtureDir() {
  const localMirror = path.resolve(process.cwd(), 'fixtures', 'oneroster', 'churchcore-academy-rostering-v1')
  if (existsSync(localMirror)) return localMirror
  return path.resolve(process.cwd(), '..', 'ChurchCore Academy', 'fixtures', 'oneroster', 'churchcore-academy-rostering-v1')
}

function packageHash(files: OneRosterPackageText[], metadataFiles: AcademyFixtureMetadata['files']) {
  const byFilename = new Map(files.map((file) => [file.filename, file.text]))
  return sha256(
    metadataFiles
      .map((file) => `${file.filename}\0${sha256(byFilename.get(file.filename) ?? '')}`)
      .join('\n'),
  )
}

function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
