import { describe, it, expect } from 'vitest'
import { textToTiptapDoc, parseDocumentFile, parsePptx, parseMultipleDocuments } from './document-parser'
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

  it('parses a PPTX file buffer with sorted slides', async () => {
    const zip = new JSZip()
    const slide1Xml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:p><a:r><a:t>Slide 1: Foundations of Discipleship</a:t></a:r></a:p>
        <a:p><a:r><a:t>Core pillars and mandate.</a:t></a:r></a:p>
      </p:sld>`
    const slide2Xml = `<?xml version="1.0" encoding="UTF-8"?>
      <p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:p><a:r><a:t>Slide 2: Spiritual Formation Practices</a:t></a:r></a:p>
        <a:p><a:r><a:t>Prayer, Fasting, and Sabbath.</a:t></a:r></a:p>
      </p:sld>`

    zip.file('ppt/slides/slide1.xml', slide1Xml)
    zip.file('ppt/slides/slide2.xml', slide2Xml)

    const buffer = await zip.generateAsync({ type: 'uint8array' })
    const result = await parsePptx(buffer)

    expect(result).toContain('### Slide 1')
    expect(result).toContain('Slide 1: Foundations of Discipleship')
    expect(result).toContain('### Slide 2')
    expect(result).toContain('Slide 2: Spiritual Formation Practices')
  })

  it('parses multiple documents in batch with source attribution', async () => {
    const zipDocx = new JSZip()
    zipDocx.file('word/document.xml', '<w:p><w:t>Sermon Series Summary Notes</w:t></w:p>')
    const docxBuf = await zipDocx.generateAsync({ type: 'uint8array' })

    const txtBuf = new TextEncoder().encode('Key Scripture verses: John 15:1-8, Galatians 5:22-23')

    const batch = await parseMultipleDocuments([
      { name: 'Sermon_Summary.docx', buffer: docxBuf },
      { name: 'Scriptures.txt', buffer: txtBuf },
    ])

    expect(batch.documents).toHaveLength(2)
    expect(batch.combinedText).toContain('=== SOURCE DOCUMENT 1: Sermon_Summary.docx')
    expect(batch.combinedText).toContain('Sermon Series Summary Notes')
    expect(batch.combinedText).toContain('=== SOURCE DOCUMENT 2: Scriptures.txt')
    expect(batch.combinedText).toContain('John 15:1-8')
  })
})
