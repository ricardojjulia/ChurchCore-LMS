// @vitest-environment node
// COUNCIL-2026-031 Prompt B — the test-surface gate must catch an untested
// surface, and every exemption failure mode, or the "features ship with tests"
// rule is only advisory.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverSurfaces,
  evaluate,
  routeFromAppPath,
  scanCoverage,
  validateA11yKnown,
  coversArgs,
} from '../../../scripts/test-surface.mjs'

let root: string
// Built indirectly so the real checker never reads these fixture strings as tags.
const C = ['cov', 'ers'].join('')

function write(rel: string, content: string) {
  const full = path.join(root, rel)
  mkdirSync(path.dirname(full), { recursive: true })
  writeFileSync(full, content)
}

function makeRepo() {
  root = mkdtempSync(path.join(tmpdir(), 'surface-'))
  write('src/app/page.tsx', 'export default function P() {}')
  write('src/app/(reports)/student/reports/page.tsx', 'export default function P() {}')
  write('src/app/courses/[id]/gradebook/page.tsx', 'export default function P() {}')
  write('src/app/api/items/route.ts', 'export async function GET() {}\nexport async function POST() {}')
  write('src/app/actions/items.ts', "'use server'\nexport async function createItem() {}\nasync function helper() {}")
  write('src/app/platform/actions.ts', "'use server'\nexport async function suspend() {}")
  write('src/app/actions/items.test.ts', "'use server'\nexport async function notASurface() {}")
  write('src/lib/client-only.ts', 'export async function notAnAction() {}')
  write('supabase/functions/send-mail/index.ts', '')
  write('supabase/functions/_shared/cors.ts', '')
  return root
}

afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }) })

const ALL_IDS = [
  'action:items.createItem',
  'action:platform/actions.suspend',
  'api:GET /api/items',
  'api:POST /api/items',
  'edge:send-mail',
  'page:/',
  'page:/courses/[id]/gradebook',
  'page:/student/reports',
]

describe('routeFromAppPath', () => {
  it('strips route groups and parallel slots, keeps dynamic segments', () => {
    expect(routeFromAppPath('.')).toBe('/')
    expect(routeFromAppPath('(auth)/login')).toBe('/login')
    expect(routeFromAppPath('courses/[id]/@modal/edit')).toBe('/courses/[id]/edit')
  })
})

describe('discoverSurfaces', () => {
  it('finds pages, each exported HTTP method, use-server exports and edge functions only', () => {
    makeRepo()
    expect(discoverSurfaces(root).map((s: { id: string }) => s.id)).toEqual(ALL_IDS)
  })
})

describe('scanCoverage + evaluate', () => {
  const today = new Date('2026-09-23T00:00:00Z')

  function coverAll(except: string[] = []) {
    const ids = ALL_IDS.filter((id) => !except.includes(id))
    write('tests/playwright/all.spec.ts', `${C}(${ids.map((id) => `'${id}'`).join(', ')})`)
  }

  it('passes when every surface is covered', () => {
    makeRepo()
    coverAll()
    const r = evaluate({ surfaces: discoverSurfaces(root), covered: scanCoverage(root), exemptions: [], today })
    expect(r.ok).toBe(true)
    expect(r.covered).toBe(ALL_IDS.length)
  })

  it('fails a newly added page that ships without a test', () => {
    makeRepo()
    coverAll()
    write('src/app/new-feature/page.tsx', 'export default function P() {}')
    const r = evaluate({ surfaces: discoverSurfaces(root), covered: scanCoverage(root), exemptions: [], today })
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual([expect.objectContaining({ kind: 'uncovered', id: 'page:/new-feature' })])
  })

  it('reads multi-line covers() calls, double quotes, and SQL -- covers: comments', () => {
    makeRepo()
    write('tests/a.spec.ts', `${C}(\n  "page:/",\n  'api:GET /api/items',\n)`)
    write('supabase/tests/x.sql', '-- covers: edge:send-mail, action:items.createItem')
    const covered = scanCoverage(root)
    expect([...covered.keys()].sort()).toEqual(['action:items.createItem', 'api:GET /api/items', 'edge:send-mail', 'page:/'])
  })

  it('ignores covers() in non-test source files', () => {
    makeRepo()
    write('src/lib/helper.ts', `${C}('page:/')`)
    expect(scanCoverage(root).size).toBe(0)
  })

  it('fails on a covers() tag that matches no surface (typo guard)', () => {
    makeRepo()
    coverAll()
    write('tests/typo.spec.ts', `${C}('page:/courses/[id]/gradbook')`)
    const r = evaluate({ surfaces: discoverSurfaces(root), covered: scanCoverage(root), exemptions: [], today })
    expect(r.problems).toEqual([expect.objectContaining({ kind: 'unknown-tag' })])
  })

  it.each([
    ['valid exemption', { surface: 'edge:send-mail', reason: 'cron only', owner: 'ricardo', expires: '2026-10-30' }, null],
    ['expired', { surface: 'edge:send-mail', reason: 'r', owner: 'o', expires: '2026-09-01' }, 'expired-exemption'],
    ['beyond 60 days', { surface: 'edge:send-mail', reason: 'r', owner: 'o', expires: '2027-01-01' }, 'invalid-exemption'],
    ['missing reason', { surface: 'edge:send-mail', owner: 'o', expires: '2026-10-01' }, 'invalid-exemption'],
    ['bad date', { surface: 'edge:send-mail', reason: 'r', owner: 'o', expires: 'soon' }, 'invalid-exemption'],
    ['unknown surface', { surface: 'edge:gone', reason: 'r', owner: 'o', expires: '2026-10-01' }, 'unknown-exemption'],
  ])('exemption: %s', (_label, exemption, expectedKind) => {
    makeRepo()
    coverAll(['edge:send-mail'])
    const r = evaluate({ surfaces: discoverSurfaces(root), covered: scanCoverage(root), exemptions: [exemption], today })
    if (expectedKind === null) {
      expect(r.ok).toBe(true)
      expect(r.exempted).toBe(1)
    } else {
      expect(r.problems.map((p: { kind: string }) => p.kind)).toContain(expectedKind)
      expect(r.ok).toBe(false)
    }
  })

  it('flags an exemption for a surface that is now covered as stale', () => {
    makeRepo()
    coverAll()
    const r = evaluate({
      surfaces: discoverSurfaces(root), covered: scanCoverage(root), today,
      exemptions: [{ surface: 'edge:send-mail', reason: 'r', owner: 'o', expires: '2026-10-01' }],
    })
    expect(r.problems).toEqual([expect.objectContaining({ kind: 'stale-exemption' })])
  })
})

describe('validateA11yKnown', () => {
  const today = new Date('2026-09-24T00:00:00Z')
  const ids = new Set(['page:/dashboard'])
  const ok = { rule: 'color-contrast', route: 'page:/dashboard', reason: 'design pass', owner: 'o', expires: '2026-11-20' }
  it('accepts a complete, in-window entry', () => {
    expect(validateA11yKnown([ok], ids, today)).toEqual([])
  })
  it.each([
    ['expired', { ...ok, expires: '2026-09-01' }, 'expired-a11y-known'],
    ['too far out', { ...ok, expires: '2027-06-01' }, 'invalid-a11y-known'],
    ['missing reason', { ...ok, reason: '' }, 'invalid-a11y-known'],
    ['unknown page', { ...ok, route: 'page:/gone' }, 'unknown-a11y-known'],
  ])('rejects %s', (_l, entry, kind) => {
    expect(validateA11yKnown([entry], ids, today).map((p: { kind: string }) => p.kind)).toEqual([kind])
  })
})

describe('coversArgs', () => {
  it('reads ids containing parentheses (route groups) whole', () => {
    expect(coversArgs(`${C}('action:(reports)/student/reports/actions.x', "page:/a")`))
      .toEqual(['action:(reports)/student/reports/actions.x', 'page:/a'])
  })
})
