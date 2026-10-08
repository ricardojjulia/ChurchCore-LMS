import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

export interface ScormManifestMetadata {
  title: string
  identifier?: string
  version: '1.2' | '2004'
  rawVersionString?: string
  launchPath: string
  masteryScore?: number
  resourceCount: number
}

export interface ScormParseResult {
  valid: boolean
  error?: string
  metadata?: ScormManifestMetadata
  fileCount: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  allowBooleanAttributes: true,
})

/**
 * Parses and validates a SCORM 1.2 or SCORM 2004 package from an ArrayBuffer or Uint8Array.
 */
export async function parseScormPackage(data: ArrayBuffer | Uint8Array): Promise<ScormParseResult> {
  try {
    const zip = await JSZip.loadAsync(data)

    // Find imsmanifest.xml (case-insensitive)
    let manifestFile = zip.file('imsmanifest.xml')
    if (!manifestFile) {
      const match = zip.file(/^imsmanifest\.xml$/i)
      if (match && match.length > 0) {
        manifestFile = match[0]
      }
    }

    if (!manifestFile) {
      return {
        valid: false,
        error: 'Invalid SCORM package: missing imsmanifest.xml at package root.',
        fileCount: 0,
      }
    }

    let filesCount = 0
    let hasPathTraversal = false

    zip.forEach((relativePath, entry) => {
      if (!entry.dir) filesCount++
      if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
        hasPathTraversal = true
      }
    })

    if (hasPathTraversal) {
      return {
        valid: false,
        error: 'Security rejection: package contains invalid or path-traversal entries.',
        fileCount: filesCount,
      }
    }

    const xmlText = await manifestFile.async('string')
    const parsedXml = parser.parse(xmlText)

    const manifest = parsedXml.manifest || parsedXml['ims:manifest']
    if (!manifest) {
      return {
        valid: false,
        error: 'Invalid SCORM manifest: could not locate <manifest> root node.',
        fileCount: filesCount,
      }
    }

    // Determine SCORM version from metadata.schemaversion
    const metadataNode = manifest.metadata || manifest['ims:metadata']
    const schemaVersion =
      metadataNode?.schemaversion ||
      metadataNode?.['ims:schemaversion'] ||
      metadataNode?.['adlcp:schemaversion'] ||
      ''

    const schemaVersionStr = String(schemaVersion).trim()
    const is2004 =
      schemaVersionStr.includes('2004') ||
      schemaVersionStr.includes('CAM 1.3') ||
      schemaVersionStr.startsWith('1.3')

    const version: '1.2' | '2004' = is2004 ? '2004' : '1.2'

    // Extract Title from organizations -> organization -> title or item -> title
    let title = 'Untitled SCORM Course'
    const orgs = manifest.organizations || manifest['ims:organizations']
    const defaultOrgId = orgs?.['@_default']

    let targetOrg = orgs?.organization || orgs?.['ims:organization']
    if (Array.isArray(targetOrg)) {
      targetOrg = targetOrg.find((o: any) => o['@_identifier'] === defaultOrgId) || targetOrg[0]
    }

    if (targetOrg?.title) {
      title = String(targetOrg.title).trim()
    }

    // Find launch resource href
    const resources = manifest.resources || manifest['ims:resources']
    let resourceList = resources?.resource || resources?.['ims:resource'] || []
    if (!Array.isArray(resourceList)) {
      resourceList = [resourceList]
    }

    // Locate primary sco or webcontent resource
    let launchPath = ''
    let masteryScore: number | undefined

    // First try finding an item referencing a resource
    let defaultItem = targetOrg?.item || targetOrg?.['ims:item']
    if (Array.isArray(defaultItem)) defaultItem = defaultItem[0]

    if (defaultItem?.title && (!title || title === 'Untitled SCORM Course')) {
      title = String(defaultItem.title).trim()
    }

    const itemRef = defaultItem?.['@_identifierref']
    const itemMastery =
      defaultItem?.['adlcp:masteryscore'] ||
      defaultItem?.masteryscore ||
      defaultItem?.['adlcp:dataFromLMS']

    if (itemMastery && !isNaN(Number(itemMastery))) {
      masteryScore = Number(itemMastery)
    }

    if (itemRef) {
      const matchedRes = resourceList.find((r: any) => r['@_identifier'] === itemRef)
      if (matchedRes?.['@_href']) {
        launchPath = matchedRes['@_href']
      }
    }

    // Fallback: look for first resource with an href attribute
    if (!launchPath) {
      const primaryRes = resourceList.find((r: any) => Boolean(r['@_href']))
      if (primaryRes?.['@_href']) {
        launchPath = primaryRes['@_href']
      }
    }

    // Default to index.html if launch path is still empty but file exists
    if (!launchPath) {
      if (zip.file('index.html') || zip.file('index.htm')) {
        launchPath = zip.file('index.html') ? 'index.html' : 'index.htm'
      } else {
        return {
          valid: false,
          error: 'Invalid SCORM package: no launchable HTML resource found in manifest.',
          fileCount: filesCount,
        }
      }
    }

    return {
      valid: true,
      metadata: {
        title,
        identifier: manifest['@_identifier'],
        version,
        rawVersionString: schemaVersionStr || undefined,
        launchPath,
        masteryScore,
        resourceCount: resourceList.length,
      },
      fileCount: filesCount,
    }
  } catch (err: any) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Failed to parse SCORM ZIP package.',
      fileCount: 0,
    }
  }
}
