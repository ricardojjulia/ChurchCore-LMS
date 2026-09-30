import JSZip from 'jszip'

export interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  text?: string
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  content?: TiptapNode[]
}

export interface ParsedDocument {
  title: string
  text: string
  tiptapContent: {
    type: 'doc'
    content: TiptapNode[]
  }
}

/**
 * Converts raw plain text / paragraphs into a standard Tiptap doc object.
 */
export function textToTiptapDoc(text: string): ParsedDocument['tiptapContent'] {
  const paragraphs = text
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    }
  }

  const content: ParsedDocument['tiptapContent']['content'] = []

  for (const block of paragraphs) {
    // Check if it looks like a markdown heading
    if (block.startsWith('# ')) {
      content.push({
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: block.slice(2).trim() }],
      })
    } else if (block.startsWith('## ')) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: block.slice(3).trim() }],
      })
    } else if (block.startsWith('### ')) {
      content.push({
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: block.slice(4).trim() }],
      })
    } else if (block.startsWith('> ')) {
      content.push({
        type: 'blockquote',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: block.slice(2).trim() }] }],
      })
    } else {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: block }],
      })
    }
  }

  return {
    type: 'doc',
    content,
  }
}

/**
 * Extracts plain text from DOCX files by reading word/document.xml with JSZip.
 */
export async function parseDocx(buffer: ArrayBuffer | Uint8Array | Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer)
    const docXmlFile = zip.file('word/document.xml')
    if (!docXmlFile) {
      throw new Error('Invalid DOCX: word/document.xml not found.')
    }
    const xml = await docXmlFile.async('string')
    
    // Replace paragraph endings and break tags with newlines
    const textWithNewlines = xml
      .replace(/<\/w:p>/g, '\n\n')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, ' ')
      .replace(/<[^>]+>/g, '') // strip all XML tags
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .trim()

    return textWithNewlines
  } catch (err: any) {
    throw new Error(`Failed to parse DOCX: ${err?.message || 'Corrupted file'}`)
  }
}

/**
 * Extracts plain text from basic PDF files or buffers.
 */
export function parsePdfText(buffer: ArrayBuffer | Uint8Array | Buffer): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes)

  // Extract readable text stream segments: BT ... ET blocks or general text
  const textBlocks: string[] = []
  const streamRegex = /BT[\s\S]*?ET/g
  let match: RegExpExecArray | null

  while ((match = streamRegex.exec(decoded)) !== null) {
    const raw = match[0]
    // Extract strings inside parentheses (Tj or TJ operators)
    const tjMatches = raw.match(/\((.*?)\)/g)
    if (tjMatches) {
      const line = tjMatches.map((t) => t.slice(1, -1)).join(' ')
      if (line.trim()) textBlocks.push(line.trim())
    }
  }

  if (textBlocks.length > 0) {
    return textBlocks.join('\n\n')
  }

  // Fallback: clean printable character stream
  const cleaned = decoded
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    .replace(/[^\x20-\x7E\s\u00A0-\u024F\u1E00-\u1EFF]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return cleaned.slice(0, 50000)
}

/**
 * General document parser that handles .txt, .md, .docx, and .pdf
 */
export async function parseDocumentFile(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array | Buffer
): Promise<ParsedDocument> {
  const lowerName = fileName.toLowerCase()
  const baseTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ').trim()
  const formattedTitle = baseTitle.charAt(0).toUpperCase() + baseTitle.slice(1)

  let extractedText = ''

  if (lowerName.endsWith('.docx')) {
    extractedText = await parseDocx(buffer)
  } else if (lowerName.endsWith('.pdf')) {
    extractedText = parsePdfText(buffer)
  } else {
    // .txt, .md, .csv, or generic text
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    extractedText = new TextDecoder('utf-8').decode(bytes)
  }

  const tiptapContent = textToTiptapDoc(extractedText)

  return {
    title: formattedTitle || 'Imported Material',
    text: extractedText,
    tiptapContent,
  }
}
