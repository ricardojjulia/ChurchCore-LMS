import { describe, expect, it } from 'vitest'
import { validateOneRosterPackage } from './validate'
import type { OneRosterPackageText } from './types'

describe('validateOneRosterPackage', () => {
  it('redacts identifiers embedded in invalid references, roles, filenames and headers', () => {
    const marker = 'private-student@example.test'
    const files = validPackage().map((file) => ({ ...file,
      text: file.text.replace(/user-1/g, marker).replace('primary,student', `primary,${marker}`)
        .replace('class-1,user-', `${marker},user-`),
    }))
    files.push({ filename: `${marker}.csv`, text: '' })
    const result = validateOneRosterPackage(files)
    expect(result.valid).toBe(false)
    expect(JSON.stringify(result.issues)).not.toContain(marker)
    expect(result.issues.some((issue) => issue.sourcedIdHash)).toBe(true)
  })

  it('validates the supported first-phase OneRoster roster package', () => {
    const result = validateOneRosterPackage(validPackage())

    expect(result.valid).toBe(true)
    expect(result.preview.totalRows).toBe(16)
    expect(result.preview.quarantinedRows).toBe(0)
    expect(result.files.find((file) => file.fileType === 'users')?.rows[0].data.password).toBeUndefined()
  })

  it('accepts OneRoster 1.2 users.csv headers without staging unsupported PII fields', () => {
    const files = validPackage().map((file) => file.filename === 'users.csv'
      ? {
          ...file,
          text: [
            [
              'sourcedId',
              'status',
              'dateLastModified',
              'enabledUser',
              'username',
              'givenName',
              'familyName',
              'agentSourcedIds',
              'primaryOrgSourcedId',
              'preferredGivenName',
              'preferredMiddleName',
              'preferredFamilyName',
              'pronouns',
              'userMasterIdentifier',
            ].join(','),
            'user-1,active,2026-09-07T00:00:00Z,true,arivera,Ana,Rivera,guardian-1,org-1,Annie,,Rivera,she/her,private-master-id',
          ].join('\n'),
        }
      : file)

    const result = validateOneRosterPackage(files)

    expect(result.valid).toBe(true)
    expect(result.issues.map((issue) => issue.code)).not.toContain('ignored_header')
    const userData = result.files.find((file) => file.fileType === 'users')?.rows[0].data
    expect(userData?.primaryOrgSourcedId).toBeUndefined()
    expect(userData?.agentSourcedIds).toBeUndefined()
    expect(JSON.stringify(result.files)).not.toContain('private-master-id')
  })

  it('reports official but out-of-profile OneRoster files distinctly from unknown files', () => {
    const result = validateOneRosterPackage([
      ...validPackage(),
      {
        filename: 'results.csv',
        text: 'sourcedId,status,dateLastModified,lineItemSourcedId,studentSourcedId,score\nresult-1,active,2026-09-07T00:00:00Z,line-1,user-1,95',
      },
      { filename: 'private-student@example.test.csv', text: '' },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('unsupported_profile_file')
    expect(result.issues.map((issue) => issue.code)).toContain('unsupported_file')
    expect(result.issues.find((issue) => issue.code === 'unsupported_profile_file')?.fileType).toBe('results')
    expect(JSON.stringify(result.issues)).not.toContain('private-student@example.test')
  })

  it('quarantines duplicate sourcedIds and missing references', () => {
    const files = validPackage().map((file) => {
      if (file.filename === 'users.csv') {
        return {
          ...file,
          text: [
            file.text,
            'user-1,active,2026-09-07T00:00:00Z,true,Duplicate,User,dupe@example.test,secret',
          ].join('\n'),
        }
      }
      if (file.filename === 'enrollments.csv') {
        return {
          ...file,
          text: [
            'sourcedId,status,dateLastModified,classSourcedId,userSourcedId,role',
            'enrollment-1,active,2026-09-07T00:00:00Z,class-missing,user-1,student',
          ].join('\n'),
        }
      }
      return file
    })

    const result = validateOneRosterPackage(files)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('duplicate_sourced_id')
    expect(result.issues.map((issue) => issue.code)).toContain('missing_reference')
    expect(result.preview.quarantinedRows).toBeGreaterThan(0)
  })

  it('quarantines unsupported roles', () => {
    const files = validPackage().map((file) => {
      if (file.filename !== 'enrollments.csv') return file
      return {
        ...file,
        text: [
          'sourcedId,status,dateLastModified,classSourcedId,userSourcedId,role',
          'enrollment-1,active,2026-09-07T00:00:00Z,class-1,user-1,superuser',
        ].join('\n'),
      }
    })

    const result = validateOneRosterPackage(files)

    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('unsupported_role')
    expect(JSON.stringify(result.issues)).not.toContain('ana@example.test')
  })

  it('accepts manifest-declared optional files and academic bulk mode', () => {
    const manifestOnly = [{
      filename: 'manifest.csv',
      text: [
        'propertyName,value',
        'manifest.version,1.0',
        'oneroster.version,1.2',
        'file.orgs,absent',
        'file.users,absent',
        'file.roles,absent',
        'file.academicSessions,absent',
        'file.courses,absent',
        'file.classes,absent',
        'file.enrollments,absent',
      ].join('\n'),
    }]
    expect(validateOneRosterPackage(manifestOnly).valid).toBe(true)

    const academicBulk = validPackage().map((file) => file.filename === 'manifest.csv'
      ? {
          ...file,
          text: file.text
            .replace('file.academicSessions,delta', 'file.academicSessions,bulk')
            .replace('file.courses,delta', 'file.courses,bulk')
            .replace('file.classes,delta', 'file.classes,bulk'),
        }
      : file)
    expect(validateOneRosterPackage(academicBulk).valid).toBe(true)
  })

  it('rejects unsupported bulk modes and file-set mismatches', () => {
    const manifestOnly = [{
      filename: 'manifest.csv',
      text: [
        'propertyName,value',
        'manifest.version,1.0',
        'oneroster.version,1.2',
        'file.orgs,absent',
        'file.users,absent',
        'file.roles,absent',
        'file.academicSessions,absent',
        'file.courses,absent',
        'file.classes,absent',
        'file.enrollments,absent',
      ].join('\n'),
    }]

    const bulk = manifestOnly.map((file) => ({
      ...file,
      text: file.text.replace('file.users,absent', 'file.users,bulk'),
    }))
    const result = validateOneRosterPackage(bulk)
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('bulk_not_supported')
    expect(result.issues.map((issue) => issue.code)).toContain('manifest_file_mismatch')
  })

  it('rejects version and file-set mismatches in the manifest', () => {
    const files = validPackage().filter((file) => file.filename !== 'classes.csv')
    files[0] = {
      ...files[0],
      text: files[0].text.replace('oneroster.version,1.2', 'oneroster.version,1.1'),
    }
    const result = validateOneRosterPackage(files)
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('unsupported_manifest_version')
    expect(result.issues.map((issue) => issue.code)).toContain('manifest_file_mismatch')
  })

  it('rejects a declared data file with no records', () => {
    const files = validPackage().map((file) => file.filename === 'courses.csv'
      ? { ...file, text: file.text.split('\n')[0] }
      : file)
    const result = validateOneRosterPackage(files)
    expect(result.valid).toBe(false)
    expect(result.issues.map((issue) => issue.code)).toContain('empty_data_file')
  })
})

function validPackage(): OneRosterPackageText[] {
  return [
    {
      filename: 'manifest.csv',
      text: 'propertyName,value\nmanifest.version,1.0\noneroster.version,1.2\nfile.orgs,delta\nfile.users,delta\nfile.roles,delta\nfile.academicSessions,delta\nfile.courses,delta\nfile.classes,delta\nfile.enrollments,delta',
    },
    {
      filename: 'orgs.csv',
      text: 'sourcedId,status,dateLastModified,name,type\norg-1,active,2026-09-07T00:00:00Z,ChurchCore,school',
    },
    {
      filename: 'users.csv',
      text: 'sourcedId,status,dateLastModified,enabledUser,givenName,familyName,email,password\nuser-1,active,2026-09-07T00:00:00Z,true,Ana,Rivera,ana@example.test,secret',
    },
    {
      filename: 'roles.csv',
      text: 'sourcedId,status,dateLastModified,userSourcedId,roleType,role\nrole-1,active,2026-09-07T00:00:00Z,user-1,primary,student',
    },
    {
      filename: 'academicSessions.csv',
      text: 'sourcedId,status,dateLastModified,title,type,startDate,endDate\nterm-1,active,2026-09-07T00:00:00Z,Fall 2026,term,2026-09-01,2026-12-15',
    },
    {
      filename: 'courses.csv',
      text: 'sourcedId,status,dateLastModified,title,courseCode\ncourse-1,active,2026-09-07T00:00:00Z,Intro Bible,TH101',
    },
    {
      filename: 'classes.csv',
      text: 'sourcedId,status,dateLastModified,title,courseSourcedId,termSourcedIds\nclass-1,active,2026-09-07T00:00:00Z,Intro Bible A,course-1,term-1',
    },
    {
      filename: 'enrollments.csv',
      text: 'sourcedId,status,dateLastModified,classSourcedId,userSourcedId,role\nenrollment-1,active,2026-09-07T00:00:00Z,class-1,user-1,student',
    },
  ]
}
