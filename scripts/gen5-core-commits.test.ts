// Our 7z unpacker (src/gen5/seven-zip.ts) on the four core builds of the site scripts/gen5-fetch.ts
// unpacks: each gives its five files with every CRC held, license.txt is the same in all four,
// and each wasm names the commits the manifest pins (scripts/gen5-pins.ts): melonDS's library
// version with the short form of its commit, and RetroArch's short commit. CI fetches the two
// pinned packages before the check, so there a missing site fails the guard; on a machine without
// it the spec skips.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type SevenZipEntry, unpack7z } from '../src/gen5/seven-zip.ts'
import { COMPONENTS, SITE_FILES } from './gen5-manifest.ts'
import { GEN5_PATHS } from './gen5-paths.ts'
import { MELONDS_SOURCE, RETROARCH_SOURCE } from './gen5-pins.ts'

const CORES = SITE_FILES.map((file) => file.path).filter((path) =>
  /^data\/cores\/melonds-[a-z-]+\.data$/.test(path),
)

const present = CORES.length > 0 && CORES.every((path) => existsSync(join(GEN5_PATHS.site, path)))

/** The files EmulatorJS's build scripts pack into each core (build.sh at the build's commit). */
const FILES = [
  'melonds_libretro.js',
  'melonds_libretro.wasm',
  'build.json',
  'core.json',
  'license.txt',
]

const short = (commit: string) => commit.slice(0, 7)

/** melonDS's libretro core builds its library version from its version and the short commit;
 * the manifest holds the version as "<version> (<short commit>)". */
const MELONDS_VERSION = `${COMPONENTS.melonds.version.split(' ')[0] ?? ''} ${short(MELONDS_SOURCE.commit)}`

const unpacked = new Map<string, SevenZipEntry[]>()

function filesOf(path: string): SevenZipEntry[] {
  let files = unpacked.get(path)
  if (files === undefined) {
    files = unpack7z(new Uint8Array(readFileSync(join(GEN5_PATHS.site, path))))
    unpacked.set(path, files)
  }
  return files
}

function bytesOf(path: string, name: string): Buffer {
  const file = filesOf(path).find((entry) => entry.name === name)
  if (file === undefined) throw new Error(`${path} holds no ${name}`)
  return Buffer.from(file.bytes.buffer, file.bytes.byteOffset, file.bytes.length)
}

// Scene: CI must never pass with the cores' spec skipped.
it.runIf(Boolean(process.env.CI))('finds the four fetched cores under CI', () => {
  expect(present, 'the core builds under .cache/gen5/emulatorjs/site/data/cores').toBe(true)
})

// Scene: the core's commits are named by the core's own bytes, unpacked by our own code.
describe.skipIf(!present)('the fetched cores, unpacked by our 7z reader', () => {
  it('lists four core builds in the manifest', () => {
    expect(CORES).toHaveLength(4)
  })

  // An unpack of about 6 MB takes under a second on the build machine; under the full suite's
  // load it can take several, so each case allows 30 s.
  it.each(CORES)(
    'unpacks the five files of %s with every CRC held',
    { timeout: 30_000 },
    (path) => {
      const files = filesOf(path)
      expect(files.map((file) => file.name)).toEqual(FILES)
      expect(files.every((file) => !file.directory && file.bytes.length > 0)).toBe(true)
    },
  )

  it.each(CORES)("finds the manifest's commits in the wasm of %s", { timeout: 30_000 }, (path) => {
    const wasm = bytesOf(path, 'melonds_libretro.wasm')
    expect(wasm.includes(MELONDS_VERSION), MELONDS_VERSION).toBe(true)
    expect(wasm.includes(short(RETROARCH_SOURCE.commit)), short(RETROARCH_SOURCE.commit)).toBe(true)
  })

  it('finds the same license.txt in all four', { timeout: 60_000 }, () => {
    const [first, ...rest] = CORES.map((path) => bytesOf(path, 'license.txt'))
    expect(rest.every((licence) => first?.equals(licence))).toBe(true)
  })
})
