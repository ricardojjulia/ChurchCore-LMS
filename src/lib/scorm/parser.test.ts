import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { parseScormPackage } from './parser'

describe('parseScormPackage', () => {
  it('rejects zip missing imsmanifest.xml', async () => {
    const zip = new JSZip()
    zip.file('dummy.txt', 'hello')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const res = await parseScormPackage(buffer)
    expect(res.valid).toBe(false)
    expect(res.error).toContain('missing imsmanifest.xml')
  })

  it('rejects zip with path traversal attacks', async () => {
    const zip = new JSZip()
    zip.file('imsmanifest.xml', '<manifest></manifest>')
    zip.file('../evil.js', 'alert(1)')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const res = await parseScormPackage(buffer)
    expect(res.valid).toBe(false)
    expect(res.error).toContain('Security rejection')
  })

  it('parses valid SCORM 1.2 manifest', async () => {
    const manifestXml = `<?xml version="1.0" standalone="no" ?>
<manifest identifier="ChurchCore_Child_Protection_101" version="1.0"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="org_default">
    <organization identifier="org_default">
      <title>Child Protection and Safety Standards</title>
      <item identifier="item_1" identifierref="res_1">
        <title>Child Protection Module</title>
        <adlcp:masteryscore>80</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_1" type="webcontent" adlcp:scormtype="sco" href="launcher.html">
      <file href="launcher.html"/>
    </resource>
  </resources>
</manifest>`

    const zip = new JSZip()
    zip.file('imsmanifest.xml', manifestXml)
    zip.file('launcher.html', '<html><body>SCORM Course</body></html>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const res = await parseScormPackage(buffer)
    expect(res.valid).toBe(true)
    expect(res.metadata?.title).toBe('Child Protection and Safety Standards')
    expect(res.metadata?.version).toBe('1.2')
    expect(res.metadata?.launchPath).toBe('launcher.html')
    expect(res.metadata?.masteryScore).toBe(80)
  })

  it('parses valid SCORM 2004 manifest', async () => {
    const manifestXml = `<?xml version="1.0" encoding="utf-8" ?>
<manifest identifier="Ministry_Leadership_2004" version="1.3"
          xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 4th Edition</schemaversion>
  </metadata>
  <organizations default="leadership_org">
    <organization identifier="leadership_org">
      <title>Ministry Leadership Ethics</title>
      <item identifier="ethics_item" identifierref="res_sco">
        <title>Ethics in Ministry</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_sco" type="webcontent" adlcp:scormType="sco" href="index_lms.html">
      <file href="index_lms.html"/>
    </resource>
  </resources>
</manifest>`

    const zip = new JSZip()
    zip.file('imsmanifest.xml', manifestXml)
    zip.file('index_lms.html', '<html><body>SCORM 2004 Course</body></html>')
    const buffer = await zip.generateAsync({ type: 'arraybuffer' })

    const res = await parseScormPackage(buffer)
    expect(res.valid).toBe(true)
    expect(res.metadata?.title).toBe('Ministry Leadership Ethics')
    expect(res.metadata?.version).toBe('2004')
    expect(res.metadata?.launchPath).toBe('index_lms.html')
  })
})
