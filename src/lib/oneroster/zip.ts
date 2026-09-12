import JSZip from 'jszip'
import { ONEROSTER_SUPPORTED_FILES } from './types'
import type { OneRosterIssue, OneRosterZipResult } from './types'

const ALLOWED_FILENAMES = new Set(ONEROSTER_SUPPORTED_FILES.map((fileType) => `${fileType}.csv`))

export interface ReadOneRosterZipOptions {
  maxPackageBytes?: number
  maxFiles?: number
  maxUncompressedBytes?: number
}

export async function readOneRosterZip(
  input: Buffer | ArrayBuffer | Uint8Array,
  options: ReadOneRosterZipOptions = {},
): Promise<OneRosterZipResult> {
  const maxPackageBytes = options.maxPackageBytes ?? 10 * 1024 * 1024
  const maxFiles = options.maxFiles ?? 20
  const maxUncompressedBytes = options.maxUncompressedBytes ?? 50 * 1024 * 1024
  const packageBytes = byteLength(input)
  const issues: OneRosterIssue[] = []

  if (packageBytes > maxPackageBytes) {
    return {
      files: [],
      issues: [{
        severity: 'error',
        code: 'package_too_large',
        message: 'OneRoster package is larger than the configured limit.',
      }],
    }
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(input)
  } catch {
    return {
      files: [],
      issues: [{
        severity: 'error',
        code: 'zip_parse_failed',
        message: 'OneRoster ZIP package could not be read.',
      }],
    }
  }

  const entries = Object.values(zip.files).filter((entry) => !entry.dir)
  if (entries.length > maxFiles) {
    issues.push({
      severity: 'error',
      code: 'too_many_files',
      message: 'OneRoster package contains too many files.',
    })
  }

  let uncompressedBytes = 0
  const files: OneRosterZipResult['files'] = []

  for (const entry of entries) {
    const filename = entry.name
    const originalFilename = entry.unsafeOriginalName

    if (isUnsafePath(filename) || (originalFilename && isUnsafePath(originalFilename))) {
      issues.push({
        severity: 'error',
        code: 'unsafe_zip_path',
        message: 'OneRoster package contains an unsafe file path.',
      })
      continue
    }

    if (filename.toLowerCase().endsWith('.zip')) {
      issues.push({
        severity: 'error',
        code: 'nested_archive_rejected',
        message: 'Nested archives are not accepted.',
      })
      continue
    }

    if (!ALLOWED_FILENAMES.has(filename)) {
      issues.push({
        severity: 'error',
        code: 'unexpected_file',
        message: 'Unexpected file in OneRoster package.',
      })
      continue
    }

    const text = await entry.async('string')
    uncompressedBytes += Buffer.byteLength(text, 'utf8')
    if (uncompressedBytes > maxUncompressedBytes) {
      issues.push({
        severity: 'error',
        code: 'uncompressed_package_too_large',
        message: 'OneRoster package expands beyond the configured limit.',
      })
      break
    }

    files.push({ filename, text })
  }

  if (!files.some((file) => file.filename === 'manifest.csv')) {
    issues.push({
      severity: 'error',
      code: 'missing_manifest',
      message: 'OneRoster package must include manifest.csv.',
    })
  }

  return { files, issues }
}

function isUnsafePath(filename: string): boolean {
  return filename.startsWith('/')
    || filename.startsWith('\\')
    || filename.includes('..')
    || filename.includes('/')
    || filename.includes('\\')
}

function byteLength(input: Buffer | ArrayBuffer | Uint8Array): number {
  if (Buffer.isBuffer(input)) return input.length
  if (input instanceof ArrayBuffer) return input.byteLength
  return input.byteLength
}
