import JSZip from 'jszip'

export interface H5PMetadata {
  title: string
  mainLibrary?: string
  language?: string
  author?: string
  license?: string
  preloadedDependencies?: Array<{ machineName: string; majorVersion: number; minorVersion: number }>
  embedTypes?: string[]
}

export interface H5PParseResult {
  valid: boolean
  error?: string
  metadata?: H5PMetadata
  hasContentJson: boolean
  fileCount: number
}

/**
 * Extracts a clean embed URL from an iframe embed snippet or raw URL.
 */
export function normalizeH5PEmbedUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''

  // If it's an iframe tag, extract the src attribute
  const match = trimmed.match(/<iframe[^>]+src=["']([^"']+)["']/i)
  if (match?.[1]) {
    return match[1]
  }

  // Remove any surrounding quotes or spaces
  return trimmed.replace(/^["']|["']$/g, '')
}

/**
 * Parses and validates an uploaded .h5p package file.
 */
export async function parseH5PPackage(data: ArrayBuffer | Uint8Array): Promise<H5PParseResult> {
  try {
    const zip = await JSZip.loadAsync(data)
    
    // Find h5p.json
    const h5pJsonFile = zip.file('h5p.json')
    if (!h5pJsonFile) {
      return {
        valid: false,
        error: 'Invalid H5P package: missing h5p.json metadata file.',
        hasContentJson: false,
        fileCount: 0,
      }
    }

    const h5pJsonText = await h5pJsonFile.async('string')
    const rawMeta = JSON.parse(h5pJsonText) as Record<string, unknown>

    const title = typeof rawMeta.title === 'string' && rawMeta.title.trim()
      ? rawMeta.title.trim()
      : 'Untitled H5P Activity'

    const mainLibrary = typeof rawMeta.mainLibrary === 'string' ? rawMeta.mainLibrary : undefined
    const language = typeof rawMeta.language === 'string' ? rawMeta.language : undefined
    const author = typeof rawMeta.author === 'string' ? rawMeta.author : undefined
    const license = typeof rawMeta.license === 'string' ? rawMeta.license : undefined

    const preloadedDependencies = Array.isArray(rawMeta.preloadedDependencies)
      ? (rawMeta.preloadedDependencies as Array<{ machineName: string; majorVersion: number; minorVersion: number }>)
      : undefined

    const embedTypes = Array.isArray(rawMeta.embedTypes)
      ? (rawMeta.embedTypes as string[])
      : undefined

    // Check for content/content.json
    const contentJsonFile = zip.file('content/content.json') || zip.file(/^content\/content\.json$/i)[0]

    let filesCount = 0
    zip.forEach((_, entry) => {
      if (!entry.dir) filesCount++
    })

    return {
      valid: true,
      metadata: {
        title,
        mainLibrary,
        language,
        author,
        license,
        preloadedDependencies,
        embedTypes,
      },
      hasContentJson: Boolean(contentJsonFile),
      fileCount: filesCount,
    }
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Failed to decompress and parse H5P package.',
      hasContentJson: false,
      fileCount: 0,
    }
  }
}
