import { describe, it, expect } from 'vitest'
import { textToTiptapDoc, parseDocumentFile } from './document-parser'
import JSZip from 'jszip'

describe('document-parser', () => {
  it('converts plain text to a valid Tiptap document', () => {
    const text = 'Hello world\n\nThis is paragraph two.'
    const doc = textToTiptapDoc(text)
    expect(doc.type).toBe('doc')
    expect(doc.content).toHaveLength(2)
    expect(doc.content[0].type).toBe('paragraph')
    expect(doc.content[0].content?.[0].text).toBe('Hello world')
  })

  it('converts markdown headings and blockquotes to Tiptap nodes', () => {
    const text = '# Main Title\n\n## Subtitle\n\n> Scripture quote\n\nRegular text'
    const doc = textToTiptapDoc(text)
    expect(doc.content).toHaveLength(4)
    expect(doc.content[0].type).toBe('heading')
    expect(doc.content[0].attrs?.level).toBe(1)
    expect(doc.content[1].type).toBe('heading')
    expect(doc.content[1].attrs?.level).toBe(2)
    expect(doc.content[2].type).toBe('blockquote')
    expect(doc.content[3].type).toBe('paragraph')
  })

  it('parses a text file buffer', async () => {
    const content = new TextEncoder().encode('Sample imported text')
    const result = await parseDocumentFile('pastoral-care.txt', content)
    expect(result.title).toBe('Pastoral care')
    expect(result.text).toBe('Sample imported text')
    expect(result.tiptapContent.content[0].content?.[0].text).toBe('Sample imported text')
  })

  it('parses a DOCX file buffer', async () => {
    const zip = new JSZip()
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>Pastoral Theology Chapter 1</w:t></w:r></w:p>
          <w:p><w:r><w:t>Key insights on pastoral ministry.</w:t></w:r></w:p>
        </w:body>
      </w:document>`
    zip.file('word/document.xml', docXml)
    const buffer = await zip.generateAsync({ type: 'uint8array' })

    const result = await parseDocumentFile('theology-notes.docx', buffer)
    expect(result.title).toBe('Theology notes')
    expect(result.text).toContain('Pastoral Theology Chapter 1')
    expect(result.text).toContain('Key insights on pastoral ministry.')
  })
})
