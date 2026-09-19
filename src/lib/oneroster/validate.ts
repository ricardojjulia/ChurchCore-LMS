import { parseOneRosterCsv } from './csv'
import { hashSourcedId } from './hash'
import {
  ONEROSTER_REQUIRED_HEADERS,
  ONEROSTER_ALLOWED_HEADERS,
  ONEROSTER_BULK_SUPPORTED_FILES,
  ONEROSTER_IMPORT_FIELD_ALLOWLIST,
  ONEROSTER_MANIFEST_DATA_FILES,
  ONEROSTER_REQUIRED_FILES,
  ONEROSTER_SUPPORTED_ROLES,
} from './schema'
import { ONEROSTER_OFFICIAL_CSV_FILES, ONEROSTER_SUPPORTED_FILES } from './types'
import type {
  OneRosterCsvFile,
  OneRosterFileType,
  OneRosterIssue,
  OneRosterPackageText,
  OneRosterPreview,
  OneRosterRow,
  OneRosterValidationOptions,
  OneRosterValidationResult,
} from './types'

const DEFAULT_MAX_ROWS_PER_FILE = 10_000
const ONEROSTER_OFFICIAL_CSV_FILE_SET = new Set<string>(ONEROSTER_OFFICIAL_CSV_FILES)

export function validateOneRosterPackage(
  packageFiles: OneRosterPackageText[],
  options: OneRosterValidationOptions = {},
): OneRosterValidationResult {
  const issues: OneRosterIssue[] = []
  const maxRowsPerFile = options.maxRowsPerFile ?? DEFAULT_MAX_ROWS_PER_FILE
  const byType = new Map<OneRosterFileType, OneRosterPackageText>()

  for (const file of packageFiles) {
    const fileType = filenameToFileType(file.filename)
    if (!fileType) {
      const officialFileType = filenameToOfficialCsvFileType(file.filename)
      if (officialFileType) {
        issues.push({
          severity: 'error',
          code: 'unsupported_profile_file',
          message: `${file.filename} is an official OneRoster CSV file, but it is outside the ChurchCore LMS rostering import profile.`,
          fileType: officialFileType,
        })
        continue
      }

      issues.push({
        severity: 'error',
        code: 'unsupported_file',
        message: 'Unsupported OneRoster file.',
      })
      continue
    }

    if (byType.has(fileType)) {
      issues.push({
        severity: 'error',
        code: 'duplicate_file',
        message: `Duplicate OneRoster file: ${file.filename}`,
        fileType,
      })
      continue
    }

    byType.set(fileType, file)
  }

  for (const requiredFile of ONEROSTER_REQUIRED_FILES) {
    if (!byType.has(requiredFile)) {
      issues.push({
        severity: 'error',
        code: 'missing_required_file',
        message: `Missing required OneRoster file: ${requiredFile}.csv`,
        fileType: requiredFile,
      })
    }
  }

  const parsedFiles: OneRosterCsvFile[] = []
  const validationFiles: OneRosterCsvFile[] = []
  for (const [fileType, file] of byType.entries()) {
    const parsed = parseOneRosterCsv(fileType, file.text)
    issues.push(...parsed.issues)

    if (parsed.rows.length > maxRowsPerFile) {
      issues.push({
        severity: 'error',
        code: 'too_many_rows',
        message: `${file.filename} exceeds the configured row limit.`,
        fileType,
      })
    }

    if (fileType !== 'manifest' && parsed.rows.length === 0) {
      issues.push({
        severity: 'error',
        code: 'empty_data_file',
        message: 'OneRoster data files must contain at least one row.',
        fileType,
      })
    }

    issues.push(...validateHeaders(fileType, parsed.rows))
    const parsedFile = {
      fileType,
      filename: file.filename,
      rows: parsed.rows,
    }
    validationFiles.push(parsedFile)
    parsedFiles.push({ ...parsedFile, rows: parsed.rows.map(redactRowToAllowlist) })
  }

  issues.push(...validateRows(validationFiles))
  issues.push(...validateManifest(validationFiles))

  const preview = buildPreview(parsedFiles, issues)

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    files: parsedFiles,
    issues,
    preview,
  }
}

function filenameToFileType(filename: string): OneRosterFileType | null {
  const match = /^([A-Za-z]+)\.csv$/.exec(filename)
  if (!match) return null
  const fileType = match[1] as OneRosterFileType
  return ONEROSTER_SUPPORTED_FILES.includes(fileType) ? fileType : null
}

function filenameToOfficialCsvFileType(filename: string): string | null {
  const match = /^([A-Za-z]+)\.csv$/.exec(filename)
  if (!match) return null
  const fileType = match[1]
  return ONEROSTER_OFFICIAL_CSV_FILE_SET.has(fileType) ? fileType : null
}

function validateManifest(files: OneRosterCsvFile[]): OneRosterIssue[] {
  const manifest = files.find((file) => file.fileType === 'manifest')
  if (!manifest) return []

  const issues: OneRosterIssue[] = []
  const properties = new Map<string, OneRosterRow>()
  for (const row of manifest.rows) {
    const name = row.data.propertyName
    if (properties.has(name)) {
      issues.push(rowIssue('duplicate_manifest_property', 'Duplicate manifest property.', row))
    } else {
      properties.set(name, row)
    }
  }

  requireManifestValue(properties, 'manifest.version', '1.0', issues)
  requireManifestValue(properties, 'oneroster.version', '1.2', issues)

  const supplied = new Set(files.map((file) => file.fileType))
  const bulkSupported = new Set<OneRosterFileType>(ONEROSTER_BULK_SUPPORTED_FILES)
  for (const fileType of ONEROSTER_MANIFEST_DATA_FILES) {
    const property = `file.${fileType}`
    const row = properties.get(property)
    if (!row) {
      issues.push({ severity: 'error', code: 'missing_manifest_property', message: 'Manifest is missing a required file declaration.', fileType: 'manifest' })
      continue
    }
    const mode = row.data.value
    if (!['absent', 'bulk', 'delta'].includes(mode)) {
      issues.push(rowIssue('invalid_manifest_mode', 'Manifest file mode must be absent, bulk, or delta.', row))
      continue
    }
    if (mode === 'bulk' && !bulkSupported.has(fileType)) {
      issues.push(rowIssue('bulk_not_supported', 'Bulk reconciliation is only supported for academic session, course, and class files.', row))
    }
    if (mode === 'absent' && supplied.has(fileType)) {
      issues.push(rowIssue('manifest_file_mismatch', 'Manifest marks a supplied file as absent.', row))
    }
    if (mode !== 'absent' && !supplied.has(fileType)) {
      issues.push(rowIssue('manifest_file_mismatch', 'Manifest declares a file that is not supplied.', row))
    }
  }
  return issues
}

function requireManifestValue(
  properties: Map<string, OneRosterRow>,
  property: string,
  expected: string,
  issues: OneRosterIssue[],
) {
  const row = properties.get(property)
  if (!row) {
    issues.push({ severity: 'error', code: 'missing_manifest_property', message: 'Manifest is missing a required version declaration.', fileType: 'manifest' })
  } else if (row.data.value !== expected) {
    issues.push(rowIssue('unsupported_manifest_version', 'Manifest declares an unsupported OneRoster version.', row))
  }
}

function validateHeaders(fileType: OneRosterFileType, rows: OneRosterRow[]): OneRosterIssue[] {
  const issues: OneRosterIssue[] = []
  const allowed = new Set(ONEROSTER_ALLOWED_HEADERS[fileType])
  const firstRow = rows[0]
  if (!firstRow) return issues

  for (const header of Object.keys(firstRow.data)) {
    if (!allowed.has(header)) {
      issues.push({
        severity: 'warning',
        code: 'ignored_header',
        message: 'An unsupported header will be ignored by the LMS importer.',
        fileType,
      })
    }
  }

  return issues
}

function validateRows(files: OneRosterCsvFile[]): OneRosterIssue[] {
  const issues: OneRosterIssue[] = []
  const rowsByFile = new Map<OneRosterFileType, OneRosterRow[]>(
    files.map((file) => [file.fileType, file.rows]),
  )

  for (const file of files) {
    issues.push(...findDuplicateSourcedIds(file))
    for (const row of file.rows) {
      if (file.fileType !== 'manifest' && !row.sourcedId) {
        issues.push(rowIssue('missing_sourced_id', 'Row is missing sourcedId.', row))
      }
      for (const field of ONEROSTER_REQUIRED_HEADERS[file.fileType]) {
        if (!row.data[field]) {
          issues.push(rowIssue('missing_required_value', `Missing required value: ${field}`, row))
        }
      }
    }
  }

  const userIds = sourcedIdSet(rowsByFile.get('users') ?? [])
  const classIds = sourcedIdSet(rowsByFile.get('classes') ?? [])
  const courseIds = sourcedIdSet(rowsByFile.get('courses') ?? [])
  const sessionIds = sourcedIdSet(rowsByFile.get('academicSessions') ?? [])

  for (const row of rowsByFile.get('roles') ?? []) {
    requireReference(row, 'userSourcedId', userIds, issues)
    validateRole(row, row.data.role, issues)
  }

  for (const row of rowsByFile.get('classes') ?? []) {
    requireReference(row, 'courseSourcedId', courseIds, issues)
    for (const termId of splitList(row.data.termSourcedIds)) {
      if (!sessionIds.has(termId)) {
        issues.push(rowIssue('missing_reference', 'Unknown termSourcedId.', row))
      }
    }
  }

  for (const row of rowsByFile.get('enrollments') ?? []) {
    requireReference(row, 'userSourcedId', userIds, issues)
    requireReference(row, 'classSourcedId', classIds, issues)
    validateRole(row, row.data.role, issues)
  }

  return issues
}

function findDuplicateSourcedIds(file: OneRosterCsvFile): OneRosterIssue[] {
  const seen = new Set<string>()
  const issues: OneRosterIssue[] = []
  for (const row of file.rows) {
    if (!row.sourcedId) continue
    if (seen.has(row.sourcedId)) {
      issues.push(rowIssue('duplicate_sourced_id', 'Duplicate sourcedId in file.', row))
    }
    seen.add(row.sourcedId)
  }
  return issues
}

function requireReference(
  row: OneRosterRow,
  field: string,
  knownIds: Set<string>,
  issues: OneRosterIssue[],
) {
  const value = row.data[field]
  if (!value || !knownIds.has(value)) {
    issues.push(rowIssue('missing_reference', `Unknown ${field}.`, row))
  }
}

function validateRole(row: OneRosterRow, role: string | undefined, issues: OneRosterIssue[]) {
  if (!role || !ONEROSTER_SUPPORTED_ROLES.has(role.toLowerCase())) {
    issues.push(rowIssue('unsupported_role', 'Unsupported OneRoster role.', row))
  }
}

function sourcedIdSet(rows: OneRosterRow[]): Set<string> {
  return new Set(rows.map((row) => row.sourcedId).filter((value): value is string => !!value))
}

function splitList(value: string | undefined): string[] {
  if (!value) return []
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function rowIssue(code: string, message: string, row: OneRosterRow): OneRosterIssue {
  return {
    severity: 'error',
    code,
    message,
    fileType: row.fileType,
    rowNumber: row.rowNumber,
    sourcedIdHash: row.sourcedIdHash,
  }
}

function redactRowToAllowlist(row: OneRosterRow): OneRosterRow {
  const allowlist = new Set(ONEROSTER_IMPORT_FIELD_ALLOWLIST[row.fileType])
  const data = Object.fromEntries(
    Object.entries(row.data).filter(([key]) => allowlist.has(key)),
  )
  return { ...row, data }
}

function buildPreview(files: OneRosterCsvFile[], issues: OneRosterIssue[]): OneRosterPreview {
  const rowErrorKeys = new Set(
    issues
      .filter((issue) => issue.severity === 'error' && issue.fileType && issue.rowNumber)
      .map((issue) => `${issue.fileType}:${issue.rowNumber}`),
  )

  const byFile: OneRosterPreview['byFile'] = {}
  let totalRows = 0
  let quarantinedRows = 0

  for (const file of files) {
    const fileTotal = file.rows.length
    const fileQuarantined = file.rows.filter((row) =>
      rowErrorKeys.has(`${row.fileType}:${row.rowNumber}`),
    ).length

    byFile[file.fileType] = {
      totalRows: fileTotal,
      validRows: fileTotal - fileQuarantined,
      quarantinedRows: fileQuarantined,
    }
    totalRows += fileTotal
    quarantinedRows += fileQuarantined
  }

  return {
    totalRows,
    validRows: totalRows - quarantinedRows,
    quarantinedRows,
    byFile,
  }
}

export { hashSourcedId }
