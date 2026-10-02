import { describe, it, expect, vi } from 'vitest'
import { normalizeH5PEmbedUrl, parseH5PPackage } from '@/lib/h5p/parser'
import JSZip from 'jszip'

describe('H5P Package Integration', () => {
  it('parses valid .h5p package zip buffer and metadata', async () => {
    const zip = new JSZip()
    const meta = {
      title: 'Pastoral Counseling Quiz',
      mainLibrary: 'H5P.QuestionSet',
      language: 'en',
      author: 'ChurchCore',
      preloadedDependencies: [{ machineName: 'H5P.QuestionSet', majorVersion: 1, minorVersion: 20 }],
    }
    zip.file('h5p.json', JSON.stringify(meta))
    zip.file('content/content.json', JSON.stringify({ questions: [] }))

    const buffer = await zip.generateAsync({ type: 'arraybuffer' })
    const result = await parseH5PPackage(buffer)

    expect(result.valid).toBe(true)
    expect(result.metadata?.title).toBe('Pastoral Counseling Quiz')
    expect(result.metadata?.mainLibrary).toBe('H5P.QuestionSet')
  })

  it('normalizes URLs correctly for embed and package', () => {
    expect(normalizeH5PEmbedUrl('https://h5p.org/node/1234')).toBe('https://h5p.org/h5p/embed/1234')
    expect(normalizeH5PEmbedUrl('https://myorg.h5p.com/content/5678')).toBe('https://myorg.h5p.com/content/5678/embed')
  })
})
