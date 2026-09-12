import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { writeFile } from 'node:fs/promises'

const output = process.argv[2] ?? '/tmp/oneroster-verification'
const prefix = 'oneroster-verification-20260907'
const files = {
  'manifest.csv': 'propertyName,value\nmanifest.version,1.0\noneroster.version,1.2\nfile.orgs,delta\nfile.users,absent\nfile.roles,absent\nfile.academicSessions,delta\nfile.courses,delta\nfile.classes,delta\nfile.enrollments,absent',
  'orgs.csv': 'sourcedId,status,dateLastModified,name,type\nverification-org,active,2026-09-07T00:00:00Z,OneRoster Verification,school',
  'academicSessions.csv': `sourcedId,status,dateLastModified,title,type,startDate,endDate\n${prefix}-term,active,2026-09-07T00:00:00Z,OneRoster Verification Term,term,2026-09-01,2026-12-15`,
  'courses.csv': `sourcedId,status,dateLastModified,title,courseCode\n${prefix}-course,active,2026-09-07T00:00:00Z,OneRoster Verification Course,OR-VERIFY`,
  'classes.csv': `sourcedId,status,dateLastModified,title,courseSourcedId,termSourcedIds\n${prefix}-class,active,2026-09-07T00:00:00Z,OneRoster Verification Class,${prefix}-course,${prefix}-term`,
}

await mkdir(output, { recursive: true })
for (const variant of ['valid', 'invalid', 'deactivate']) {
  const zip = new JSZip()
  for (const [filename, original] of Object.entries(files)) {
    let text = original
    if (variant === 'invalid' && filename === 'classes.csv') text = text.replace(`${prefix}-course,`, 'missing-course,')
    if (variant === 'deactivate' && ['academicSessions.csv', 'courses.csv', 'classes.csv'].includes(filename)) text = text.replace(',active,', ',tobedeleted,')
    zip.file(filename, text)
  }
  const target = path.join(output, `${variant}.zip`)
  await writeFile(target, await zip.generateAsync({ type: 'nodebuffer' }))
  console.log(target)
}
