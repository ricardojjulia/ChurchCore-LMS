import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { normalizeH5PEmbedUrl, parseH5PPackage } from './parser'

describe('normalizeH5PEmbedUrl', () => {
  it('extracts URL from an iframe embed code snippet', () => {
    const embedCode = '<iframe src="https://h5p.org/h5p/embed/615" width="1090" height="674" frameborder="0" allowfullscreen="allowfullscreen" allow="geolocation *; microphone *; camera *; midi *; encrypted-media *"></iframe>'
    expect(normalizeH5PEmbedUrl(embedCode)).toBe('https://h5p.org/h5p/embed/615')
  })

  it('preserves clean raw URLs', () => {
    const rawUrl = 'https://app.lumi.education/run/H5P_ID123'
    expect(normalizeH5PEmbedUrl(rawUrl)).toBe('https://app.lumi.education/run/H5P_ID123')
  })

  it('strips surrounding quotes', () => {
    expect(normalizeH5PEmbedUrl('"https://example.com/h5p/1"')).toBe('https://example.com/h5p/1')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeH5PEmbedUrl('')).toBe('')
    expect(normalizeH5PEmbedUrl('   ')).toBe('')
  })
})

describe('parseH5PPackage', () => {
  it('returns invalid if zip does not contain h5p.json', async () => {
    const zip = new JSZip()
    zip.file('dummy.txt', 'hello')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const result = await parseH5PPackage(buffer)
    expect(result.valid).toBe(false)
    expect(result.error).toContain('missing h5p.json')
  })

  it('successfully extracts metadata from valid h5p.json and content.json', async () => {
    const zip = new JSZip()
    const meta = {
      title: 'Introductory Greek Vocab Quiz',
      mainLibrary: 'H5P.MultiChoice',
      language: 'en',
      author: 'Prof. Mark',
      license: 'CC BY',
      preloadedDependencies: [{ machineName: 'H5P.MultiChoice', majorVersion: 1, minorVersion: 14 }],
    }
    zip.file('h5p.json', JSON.stringify(meta))
    zip.file('content/content.json', JSON.stringify({ questions: [] }))

    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await parseH5PPackage(buffer)

    expect(result.valid).toBe(true)
    expect(result.metadata?.title).toBe('Introductory Greek Vocab Quiz')
    expect(result.metadata?.mainLibrary).toBe('H5P.MultiChoice')
    expect(result.metadata?.author).toBe('Prof. Mark')
    expect(result.hasContentJson).toBe(true)
    expect(result.fileCount).toBe(2)
  })
})
