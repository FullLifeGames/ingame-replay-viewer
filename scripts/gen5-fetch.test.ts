import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { PACKAGES, placeEntry, verifyIntegrity } from './gen5-fetch'

const integrityOf = (bytes: Uint8Array) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`

// Scene: a changed package on the registry stops the fetch before anything is unpacked.
describe('verifyIntegrity', () => {
  const tarball = new TextEncoder().encode('a tarball')

  it('accepts bytes whose SHA-512 matches the pinned integrity', () => {
    expect(() => {
      verifyIntegrity(tarball, integrityOf(tarball), 'pkg')
    }).not.toThrow()
  })

  it('refuses bytes whose SHA-512 differs, naming the package', () => {
    const other = new TextEncoder().encode('another tarball')
    expect(() => {
      verifyIntegrity(other, integrityOf(tarball), 'pkg@1.0.0')
    }).toThrow(/pkg@1\.0\.0.*SHA-512/)
  })

  it('refuses an integrity that is not SHA-512', () => {
    expect(() => {
      verifyIntegrity(tarball, 'sha1-abc', 'pkg')
    }).toThrow('sha512')
  })
})

describe('PACKAGES', () => {
  it('pins each package to a version and a SHA-512 integrity', () => {
    for (const pkg of PACKAGES) {
      expect(pkg.spec).toMatch(/^@emulatorjs\/[a-z-]+@\d+\.\d+\.\d+$/)
      expect(pkg.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/)
    }
  })
})

// The loader looks for cores under data/cores/; the loader package keeps its own layout.
describe('placeEntry', () => {
  it('puts a core file at data/cores/<name>.data', () => {
    expect(placeEntry('data/cores', 'package/melonds-wasm.data')).toBe(
      'data/cores/melonds-wasm.data',
    )
  })

  it('keeps the loader package layout from its root', () => {
    expect(placeEntry('', 'package/data/loader.js')).toBe('data/loader.js')
  })

  it('refuses an entry outside the package folder', () => {
    expect(() => placeEntry('', 'other/loader.js')).toThrow('other/loader.js')
  })

  it('refuses an entry that climbs out of its mount', () => {
    expect(() => placeEntry('data/cores', 'package/../../x.js')).toThrow('package/../../x.js')
  })
})
