import { readFileSync } from 'fs'
import { resolve } from 'path'

const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
const changelog = readFileSync(resolve('CHANGELOG.md'), 'utf8')

const match = changelog.match(/^## \[(\d+\.\d+\.\d+)\]/m)
if (!match) {
  console.error('ERROR: No version entry found in CHANGELOG.md (expected ## [x.x.x])')
  process.exit(1)
}

if (pkg.version !== match[1]) {
  console.error(
    `ERROR: version mismatch — package.json=${pkg.version}, CHANGELOG.md=${match[1]}\n` +
    'Fix: update package.json version OR add a CHANGELOG entry for the current version.',
  )
  process.exit(1)
}

console.log(`OK: version ${pkg.version} is consistent between package.json and CHANGELOG.md`)
