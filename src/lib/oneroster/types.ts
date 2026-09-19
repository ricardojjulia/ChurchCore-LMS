export const ONEROSTER_OFFICIAL_CSV_FILES = [
  'manifest',
  'academicSessions',
  'categories',
  'classes',
  'classResources',
  'courseResources',
  'courses',
  'demographics',
  'enrollments',
  'lineItemLearningObjectiveIds',
  'lineItems',
  'lineItemScoreScales',
  'orgs',
  'resources',
  'resultLearningObjectiveIds',
  'results',
  'resultScoreScales',
  'roles',
  'scoreScales',
  'userProfiles',
  'userResources',
  'users',
] as const

export type OneRosterOfficialCsvFileType = (typeof ONEROSTER_OFFICIAL_CSV_FILES)[number]

export const ONEROSTER_SUPPORTED_FILES = [
  'manifest',
  'orgs',
  'users',
  'roles',
  'academicSessions',
  'courses',
  'classes',
  'enrollments',
] as const

export type OneRosterFileType = (typeof ONEROSTER_SUPPORTED_FILES)[number]

export type OneRosterSeverity = 'error' | 'warning'

export interface OneRosterIssue {
  severity: OneRosterSeverity
  code: string
  message: string
  fileType?: OneRosterFileType | string
  rowNumber?: number
  sourcedId?: string
  sourcedIdHash?: string
}

export interface OneRosterCsvFile {
  fileType: OneRosterFileType
  filename: string
  rows: OneRosterRow[]
}

export interface OneRosterRow {
  fileType: OneRosterFileType
  rowNumber: number
  sourcedId?: string
  sourcedIdHash?: string
  data: Record<string, string>
}

export interface OneRosterPackageText {
  filename: string
  text: string
}

export interface OneRosterZipResult {
  files: OneRosterPackageText[]
  issues: OneRosterIssue[]
}

export interface OneRosterValidationResult {
  valid: boolean
  files: OneRosterCsvFile[]
  issues: OneRosterIssue[]
  preview: OneRosterPreview
}

export interface OneRosterPreview {
  totalRows: number
  validRows: number
  quarantinedRows: number
  byFile: Record<string, OneRosterPreviewFile>
}

export interface OneRosterPreviewFile {
  totalRows: number
  validRows: number
  quarantinedRows: number
}

export interface OneRosterValidationOptions {
  maxRowsPerFile?: number
}
