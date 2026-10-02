import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import JSZip from 'jszip'

const BUCKET = 'assignment-files'

// In-memory cache for parsed SCORM zip archives (blockId -> JSZip instance)
const zipCache = new Map<string, { zip: JSZip; cachedAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1000 // 30 minutes

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'html':
    case 'htm':
      return 'text/html'
    case 'js':
      return 'application/javascript'
    case 'css':
      return 'text/css'
    case 'json':
      return 'application/json'
    case 'xml':
      return 'application/xml'
    case 'svg':
      return 'image/svg+xml'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    case 'mp4':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'woff':
      return 'font/woff'
    case 'woff2':
      return 'font/woff2'
    case 'ttf':
      return 'font/ttf'
    case 'eot':
      return 'application/vnd.ms-fontobject'
    case 'otf':
      return 'font/otf'
    case 'pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, key)
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ blockId: string; file: string[] }> }
) {
  try {
    const { blockId, file } = await context.params
    if (!blockId || !file || file.length === 0) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const subPath = file.join('/')
    const serviceSupabase = getServiceSupabase()

    // Check memory cache first
    let zipEntry = zipCache.get(blockId)
    if (!zipEntry || Date.now() - zipEntry.cachedAt > CACHE_TTL_MS) {
      const { data: block, error: blockErr } = await serviceSupabase
        .from('course_blocks')
        .select('id, content')
        .eq('id', blockId)
        .single()

      if (blockErr || !block) {
        return NextResponse.json({ error: 'Block not found' }, { status: 404 })
      }

      const content = (block.content || {}) as Record<string, unknown>
      const packagePath =
        typeof content.package_path === 'string'
          ? content.package_path
          : typeof content.package_url === 'string' && !content.package_url.startsWith('blob:')
          ? content.package_url
          : null

      if (!packagePath) {
        return NextResponse.json({ error: 'No SCORM package found for this block' }, { status: 404 })
      }

      // Download package from storage
      const { data: fileData, error: downloadErr } = await serviceSupabase.storage
        .from(BUCKET)
        .download(packagePath)

      if (downloadErr || !fileData) {
        return NextResponse.json({ error: 'Could not load package from storage' }, { status: 404 })
      }

      const arrayBuffer = await fileData.arrayBuffer()
      const zip = await JSZip.loadAsync(arrayBuffer)
      zipEntry = { zip, cachedAt: Date.now() }
      zipCache.set(blockId, zipEntry)
    }

    // Lookup requested file inside the zip archive
    let targetZipFile = zipEntry.zip.file(subPath)
    if (!targetZipFile) {
      // Decode URI components if encoded
      try {
        const decoded = decodeURIComponent(subPath)
        targetZipFile = zipEntry.zip.file(decoded)
      } catch {}
    }

    if (!targetZipFile) {
      // Case-insensitive lookup
      const lower = subPath.toLowerCase()
      const match = zipEntry.zip.file(new RegExp(`^${lower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'))[0]
      if (match) targetZipFile = match
    }

    if (!targetZipFile) {
      return NextResponse.json({ error: `File not found: ${subPath}` }, { status: 404 })
    }

    const mimeType = getMimeType(subPath)
    const isText =
      mimeType.startsWith('text/') ||
      mimeType.includes('json') ||
      mimeType.includes('javascript') ||
      mimeType.includes('xml') ||
      mimeType.includes('svg')

    if (isText) {
      let textContent = await targetZipFile.async('string')

      // If this is an HTML document, inject the SCORM API bridge script into the <head>
      if (mimeType === 'text/html') {
        const bridgeScript = `<script src="/scorm/scorm-bridge.js"></script>`
        if (textContent.includes('<head>')) {
          textContent = textContent.replace('<head>', `<head>${bridgeScript}`)
        } else if (textContent.includes('<HEAD>')) {
          textContent = textContent.replace('<HEAD>', `<HEAD>${bridgeScript}`)
        } else {
          textContent = bridgeScript + textContent
        }
      }

      return new NextResponse(textContent, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } else {
      const buffer = await targetZipFile.async('nodebuffer')
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error reading SCORM file' }, { status: 500 })
  }
}
