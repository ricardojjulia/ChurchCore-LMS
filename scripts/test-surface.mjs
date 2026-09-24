#!/usr/bin/env node
// COUNCIL-2026-031 D5/D6 — test-surface coverage gate.
//
// Discovers every product surface from the filesystem (pages, API methods,
// Server Actions, Edge Functions), scans test files for covers('…') tags, and
// fails unless every surface is covered or carries a valid, unexpired
// exemption in tests/surface/exemptions.json. No services required.
//
//   node scripts/test-surface.mjs            human report, exit 1 on failure
//   node scripts/test-surface.mjs --json     machine-readable report
//   node scripts/test-surface.mjs --list     print every discovered surface id

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const MAX_EXEMPTION_DAYS = 60
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs)$/
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', 'playwright-report', 'test-results', '.auth'])

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const toPosix = (p) => p.split(path.sep).join('/')
const isTestFile = (p) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)

// '/(reports)/student/reports' → '/student/reports'; '@slot' segments dropped.
export function routeFromAppPath(relDir) {
  const segments = toPosix(relDir).split('/').filter((s) => s && s !== '.')
    .filter((s) => !(s.startsWith('(') && s.endsWith(')')) && !s.startsWith('@'))
  return '/' + segments.join('/')
}

export function discoverSurfaces(root) {
  const appDir = path.join(root, 'src/app')
  const surfaces = []

  for (const file of walk(appDir)) {
    const rel = toPosix(path.relative(appDir, file))
    const base = path.basename(rel)
    if (/^page\.(tsx|ts|jsx|js)$/.test(base)) {
      surfaces.push({ id: `page:${routeFromAppPath(path.dirname(rel))}`, file: toPosix(path.relative(root, file)) })
    } else if (/^route\.(ts|js)$/.test(base)) {
      const src = readFileSync(file, 'utf8')
      const route = routeFromAppPath(path.dirname(rel))
      for (const m of HTTP_METHODS) {
        const re = new RegExp(`export\\s+(?:async\\s+function\\s+${m}\\b|function\\s+${m}\\b|const\\s+${m}\\b)`)
        if (re.test(src)) surfaces.push({ id: `api:${m} ${route}`, file: toPosix(path.relative(root, file)) })
      }
    }
  }

  const srcDir = path.join(root, 'src')
  for (const file of walk(srcDir)) {
    if (!SOURCE_EXT.test(file) || isTestFile(file)) continue
    const src = readFileSync(file, 'utf8')
    if (!/^\s*['"]use server['"]/.test(src)) continue
    const relToApp = toPosix(path.relative(appDir, file)).replace(SOURCE_EXT, '')
    const key = relToApp.startsWith('actions/') ? relToApp.slice('actions/'.length) : relToApp
    for (const m of src.matchAll(/^export\s+async\s+function\s+(\w+)/gm)) {
      surfaces.push({ id: `action:${key}.${m[1]}`, file: toPosix(path.relative(root, file)) })
    }
  }

  const fnDir = path.join(root, 'supabase/functions')
  if (existsSync(fnDir)) {
    for (const name of readdirSync(fnDir)) {
      if (name.startsWith('_') || name.startsWith('.')) continue
      if (statSync(path.join(fnDir, name)).isDirectory()) {
        surfaces.push({ id: `edge:${name}`, file: `supabase/functions/${name}` })
      }
    }
  }

  const seen = new Set()
  return surfaces.filter((s) => (seen.has(s.id) ? false : seen.add(s.id)))
    .sort((a, b) => a.id.localeCompare(b.id))
}

const TEST_ROOTS = ['tests', 'src', 'supabase/tests']

// covers('a', "b", `c`) in JS/TS test files; `-- covers: a, b` in SQL.
export function scanCoverage(root) {
  const covered = new Map() // id → Set<file>
  const add = (id, file) => {
    const key = id.trim()
    if (!key) return
    if (!covered.has(key)) covered.set(key, new Set())
    covered.get(key).add(file)
  }
  for (const dir of TEST_ROOTS) {
    for (const file of walk(path.join(root, dir))) {
      const rel = toPosix(path.relative(root, file))
      const inTestTree = rel.startsWith('tests/') || rel.startsWith('supabase/tests/') || isTestFile(rel)
      if (!inTestTree) continue
      if (rel.endsWith('/covers.ts')) continue // the covers() helper itself
      const src = readFileSync(file, 'utf8')
      if (rel.endsWith('.sql')) {
        for (const m of src.matchAll(/--\s*covers:\s*(.+)$/gm)) m[1].split(',').forEach((id) => add(id, rel))
        continue
      }
      if (!SOURCE_EXT.test(rel)) continue
      for (const id of coversArgs(src)) add(id, rel)
    }
  }
  return covered
}

// String-literal arguments of every covers(...) call. Quote-aware, so ids
// that contain parentheses (route groups such as "(reports)") are read whole.
export function coversArgs(src) {
  const ids = []
  const re = /\bcovers\(/g
  let m
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length
    let quote = null
    let current = ''
    for (; i < src.length; i++) {
      const ch = src[i]
      if (quote) {
        if (ch === '\\') { current += src[++i] ?? ''; continue }
        if (ch === quote) { if (current) ids.push(current); current = ''; quote = null; continue }
        current += ch
      } else if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch
      } else if (ch === ')') {
        break
      }
    }
  }
  return ids
}

export function loadExemptions(root) {
  const file = path.join(root, 'tests/surface/exemptions.json')
  if (!existsSync(file)) return []
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('tests/surface/exemptions.json must be an array')
  return parsed
}

export function evaluate({ surfaces, covered, exemptions, today = new Date() }) {
  const ids = new Set(surfaces.map((s) => s.id))
  const todayStr = today.toISOString().slice(0, 10)
  const maxDate = new Date(today.getTime() + MAX_EXEMPTION_DAYS * 86_400_000).toISOString().slice(0, 10)
  const problems = []
  const exempt = new Map()

  for (const e of exemptions) {
    const where = `exemption ${JSON.stringify(e.surface ?? '(missing surface)')}`
    if (!e.surface || !e.reason || !e.owner || !e.expires) {
      problems.push({ kind: 'invalid-exemption', id: e.surface ?? '', detail: `${where} needs surface, reason, owner, expires` })
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires)) {
      problems.push({ kind: 'invalid-exemption', id: e.surface, detail: `${where} expires must be YYYY-MM-DD` })
      continue
    }
    if (!ids.has(e.surface)) problems.push({ kind: 'unknown-exemption', id: e.surface, detail: `${where} names a surface that no longer exists` })
    else if (covered.has(e.surface)) problems.push({ kind: 'stale-exemption', id: e.surface, detail: `${where} is now covered — delete the exemption` })
    else if (e.expires < todayStr) problems.push({ kind: 'expired-exemption', id: e.surface, detail: `${where} expired on ${e.expires}` })
    else if (e.expires > maxDate) problems.push({ kind: 'invalid-exemption', id: e.surface, detail: `${where} expires more than ${MAX_EXEMPTION_DAYS} days out (${e.expires} > ${maxDate})` })
    else exempt.set(e.surface, e)
  }

  const uncovered = surfaces.filter((s) => !covered.has(s.id) && !exempt.has(s.id))
  for (const s of uncovered) problems.push({ kind: 'uncovered', id: s.id, detail: `${s.id} (${s.file}) has no covers() test and no exemption` })

  // Tags that match no surface are almost always typos — fail on them too.
  for (const [id, files] of covered) {
    if (!ids.has(id)) problems.push({ kind: 'unknown-tag', id, detail: `covers('${id}') in ${[...files].join(', ')} matches no surface` })
  }

  return {
    total: surfaces.length,
    covered: surfaces.filter((s) => covered.has(s.id)).length,
    exempted: exempt.size,
    problems,
    ok: problems.length === 0,
  }
}

// tests/surface/a11y-known.json: tolerated axe violations. Same discipline as
// exemptions: reason + owner + an expiry at most MAX_EXEMPTION_DAYS out, and the
// route must still exist.
export function validateA11yKnown(entries, surfaceIds, today = new Date()) {
  const problems = []
  const todayStr = today.toISOString().slice(0, 10)
  const maxDate = new Date(today.getTime() + MAX_EXEMPTION_DAYS * 86_400_000).toISOString().slice(0, 10)
  for (const e of entries) {
    const where = `a11y-known ${e.route ?? '?'} ${e.rule ?? '?'}`
    if (!e.rule || !e.route || !e.reason || !e.owner || !/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '')) {
      problems.push({ kind: 'invalid-a11y-known', id: e.route ?? '', detail: `${where} needs rule, route, reason, owner, expires (YYYY-MM-DD)` })
    } else if (!surfaceIds.has(e.route)) {
      problems.push({ kind: 'unknown-a11y-known', id: e.route, detail: `${where} names a page that no longer exists` })
    } else if (e.expires < todayStr) {
      problems.push({ kind: 'expired-a11y-known', id: e.route, detail: `${where} expired on ${e.expires} — fix it or re-justify` })
    } else if (e.expires > maxDate) {
      problems.push({ kind: 'invalid-a11y-known', id: e.route, detail: `${where} expires more than ${MAX_EXEMPTION_DAYS} days out` })
    }
  }
  return problems
}

function main() {
  const root = process.cwd()
  const args = new Set(process.argv.slice(2))
  const surfaces = discoverSurfaces(root)
  if (args.has('--list')) {
    for (const s of surfaces) console.log(s.id)
    return
  }
  const result = evaluate({ surfaces, covered: scanCoverage(root), exemptions: loadExemptions(root) })
  const a11yFile = path.join(root, 'tests/surface/a11y-known.json')
  if (existsSync(a11yFile)) {
    const extra = validateA11yKnown(JSON.parse(readFileSync(a11yFile, 'utf8')), new Set(surfaces.map((s) => s.id)))
    result.problems.push(...extra)
    result.ok = result.problems.length === 0
  }
  if (args.has('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    const byKind = Object.groupBy ? Object.groupBy(result.problems, (p) => p.kind) : {}
    console.log(`Test surface: ${result.covered}/${result.total} covered, ${result.exempted} exempt, ${result.problems.length} problem(s)`)
    for (const [kind, items] of Object.entries(byKind)) {
      console.log(`\n${kind} (${items.length}):`)
      for (const p of items) console.log(`  - ${p.detail}`)
    }
    if (!result.ok) {
      console.log('\nEvery page, API method, Server Action and Edge Function needs a covers() tag in a test')
      console.log('(see docs/TESTING.md) or a dated exemption in tests/surface/exemptions.json.')
    }
  }
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main()
