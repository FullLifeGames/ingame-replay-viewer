// The manifest (scripts/gen5-manifest.ts) against the site scripts/gen5-fetch.ts unpacks. CI
// fetches the two pinned packages before the check, so there a missing site fails the guard; on a
// machine without it the comparison skips.
import { existsSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SITE_FILES } from './gen5-manifest'
import { GEN5_PATHS } from './gen5-paths'

const SITE = GEN5_PATHS.site

// Scene: CI must never pass with the site's comparison skipped.
it.runIf(Boolean(process.env.CI))('finds the fetched site under CI', () => {
  expect(existsSync(SITE), '.cache/gen5/emulatorjs/site exists').toBe(true)
})

function siteFiles(): string[] {
  return readdirSync(SITE, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(SITE, join(entry.parentPath, entry.name)))
    .sort()
}

/** What the site holds and the servers refuse: its docs, its demo page, its unpackers (the page
 * unpacks the core in a worker of its own). */
const REFUSED = [
  '.gitattributes',
  'CHANGES.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'data/compression/README.md',
  'data/compression/extract7z.js',
  'data/compression/extractzip.js',
  'data/compression/libunrar.js',
  'data/compression/libunrar.wasm',
  'data/cores/README.md',
  'data/cores/package.json',
  'data/localization/README.md',
  'data/localization/retroarch.json',
  'data/version.json',
  'docs/Logo-light.png',
  'docs/Logo.png',
  'docs/Logo.svg',
  'docs/contributors.json',
  'docs/contributors.md',
  'docs/favicon.ico',
  'index.html',
  'package.json',
].sort()

// Scene: the manifest and the fetched site agree.
describe.skipIf(!existsSync(SITE))('the manifest and the fetched site', () => {
  const files = existsSync(SITE) ? siteFiles() : []
  const paths = (presence: 'served' | 'absent'): string[] =>
    SITE_FILES.filter((file) => file.presence === presence).map((file) => file.path)

  it('finds every served entry in the site and no absent one', () => {
    expect(paths('served').filter((path) => !files.includes(path))).toEqual([])
    expect(paths('absent').filter((path) => files.includes(path))).toEqual([])
  })

  it('leaves out exactly the docs, the demo page and the unpackers', () => {
    const served = new Set(paths('served'))
    expect(files.filter((path) => !served.has(path))).toEqual(REFUSED)
  })
})
