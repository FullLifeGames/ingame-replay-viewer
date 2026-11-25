// The source archives on the build machine (#79): each one, unpacked from its gzip, hashes to the
// tar's SHA-256 its pin names (scripts/gen5-manifest.ts). CI fetches no sources (D3), so there the
// spec skips, as on any machine where scripts/gen5-sources.ts has not placed every archive.
import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { archiveName, type Source, SOURCES } from './gen5-manifest.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

const fileOf = (source: Source) => join(GEN5_PATHS.sources, archiveName(source))

/** The SHA-256 of the tar inside the gzipped archive `file`. */
async function tarHash(file: string): Promise<string> {
  const hash = createHash('sha256')
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      hash.update(chunk)
      done()
    },
  })
  await pipeline(createReadStream(file), createGunzip(), sink)
  return hash.digest('hex')
}

const placed = SOURCES.length > 0 && SOURCES.every((source) => existsSync(fileOf(source)))

describe.skipIf(!placed)(
  'the placed source archives (skips unless scripts/gen5-sources.ts placed every one)',
  () => {
    it.each(SOURCES.map((source) => [source.name, source] as const))(
      '%s unpacks to the pinned tar',
      async (_name, source) => {
        expect(await tarHash(fileOf(source))).toBe(source.tar)
      },
      120_000,
    )
  },
)
