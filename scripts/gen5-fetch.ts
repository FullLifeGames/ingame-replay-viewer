// Fetches the pinned EmulatorJS packages for the Gen 5 spike (#72, D2): the npm tarballs of the
// loader and the melonDS core, each checked against the registry's SHA-512 integrity pinned below,
// unpacked into .cache/gen5/emulatorjs/site/. package.json stays untouched; nothing is committed.
// Usage: node scripts/gen5-fetch.ts
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, normalize, relative } from 'node:path'

import { GEN5_PATHS } from './gen5-paths.ts'
import { EMULATORJS_COMMIT } from './gen5-pins.ts'

interface PinnedPackage {
  spec: string
  tarball: string
  integrity: string
  /** The registry's gitHead: the commit of EmulatorJS the package was packed from. */
  gitHead: string
  /** Where the package's files go under the served site; the loader expects cores in data/cores. */
  mount: string
}

const REGISTRY = 'https://registry.npmjs.org'

/** `npm view <spec> dist.integrity gitHead`, read 24.11.2026. */
export const PACKAGES: readonly PinnedPackage[] = [
  {
    spec: '@emulatorjs/emulatorjs@4.2.3',
    tarball: `${REGISTRY}/@emulatorjs/emulatorjs/-/emulatorjs-4.2.3.tgz`,
    integrity:
      'sha512-7z3qaA4LwyurhuGvdMUDF9xJpEbxC3SNy9+E9tSaOsRo8FCS2QXam/0k/lc9kqHWRFIlLKWahNjPAStyL0rFnw==',
    gitHead: EMULATORJS_COMMIT,
    mount: '',
  },
  {
    spec: '@emulatorjs/core-melonds@4.2.3',
    tarball: `${REGISTRY}/@emulatorjs/core-melonds/-/core-melonds-4.2.3.tgz`,
    integrity:
      'sha512-IjsEBNLPPbqU2GSeWEoEkOgAonK3JEyzvoYR3ucgOXu6InzDNdfuA5kP/mMh3d6DwCUbOwfnqGZuZXMTyNE2wA==',
    gitHead: EMULATORJS_COMMIT,
    mount: 'data/cores',
  },
]

/** Throws unless `bytes` hash to the pinned SHA-512 `integrity` (npm's `sha512-<base64>` form). */
export function verifyIntegrity(bytes: Uint8Array, integrity: string, name: string): void {
  const [algorithm, expected] = integrity.split('-', 2)
  if (algorithm !== 'sha512' || expected === undefined) {
    throw new Error(`${name}: the pinned integrity must be sha512-<base64>, not ${integrity}`)
  }
  const actual = createHash('sha512').update(bytes).digest('base64')
  if (actual !== expected) {
    throw new Error(`${name}: SHA-512 ${actual} differs from the pinned ${expected}`)
  }
}

/** The site path for a tarball entry: npm packs every file under `package/`. */
export function placeEntry(mount: string, entry: string): string {
  const inside = entry.startsWith('package/') ? normalize(entry.slice('package/'.length)) : ''
  if (inside === '' || inside.startsWith('..') || inside.startsWith('/')) {
    throw new Error(`tarball entry ${entry} lies outside its package folder`)
  }
  return mount === '' ? inside : `${mount}/${inside}`
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
}

async function fetchPackage(pkg: PinnedPackage): Promise<number> {
  const response = await fetch(pkg.tarball)
  if (!response.ok)
    throw new Error(`${pkg.spec}: ${pkg.tarball} answered ${String(response.status)}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  verifyIntegrity(bytes, pkg.integrity, pkg.spec)
  const name = pkg.spec.replace(/[@/]/g, '_')
  const tgz = join(GEN5_PATHS.emulatorjs, 'tarballs', `${name}.tgz`)
  const stage = join(GEN5_PATHS.emulatorjs, 'stage', name)
  mkdirSync(join(GEN5_PATHS.emulatorjs, 'tarballs'), { recursive: true })
  mkdirSync(stage, { recursive: true })
  writeFileSync(tgz, bytes)
  execFileSync('tar', ['-xzf', tgz, '-C', stage, '--no-same-owner', '--no-same-permissions'])
  const files = filesUnder(stage)
  for (const file of files) {
    const target = join(GEN5_PATHS.site, placeEntry(pkg.mount, file))
    mkdirSync(join(target, '..'), { recursive: true })
    cpSync(join(stage, file), target)
  }
  process.stdout.write(`gen5-fetch: ${pkg.spec} verified, ${String(files.length)} files placed\n`)
  return files.length
}

async function main(): Promise<void> {
  rmSync(GEN5_PATHS.emulatorjs, { recursive: true, force: true })
  for (const pkg of PACKAGES) await fetchPackage(pkg)
  rmSync(join(GEN5_PATHS.emulatorjs, 'stage'), { recursive: true, force: true })
  process.stdout.write(`gen5-fetch: site in ${GEN5_PATHS.site}\n`)
}

if (import.meta.main) await main()
