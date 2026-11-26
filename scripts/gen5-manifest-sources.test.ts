// The sources of the Gen 5 page's components (#79): each named once by commit, with its basis in
// words, and each with one archive. Moved out of scripts/gen5-manifest.test.ts, which reached its
// line ceiling.
import { describe, expect, it } from 'vitest'

import { PACKAGES } from './gen5-fetch'
import { archiveName, COMPONENTS, isSourceArchive, SOURCES } from './gen5-manifest'
import { EMSCRIPTEN_LLVM_COMMIT } from './gen5-pins'

/** The source of that name in SOURCES; throws when there is none. */
function pin(name: string) {
  const found = SOURCES.find((source) => source.name === name)
  if (found === undefined) throw new Error(`no source ${name}`)
  return found
}

// Scene: every component names its source by commit, and each source gets one archive.
describe('the sources', () => {
  it('fetches each repository once, under its own name, as the components name it', () => {
    expect(SOURCES.map((source) => source.name)).toEqual([
      'emulatorjs',
      'melonds',
      'retroarch',
      'emulatorjs-build',
      'emscripten',
      'zlib',
      'nipplejs',
      'socket.io',
    ])
    expect(new Set(SOURCES.map((source) => source.repository)).size).toBe(SOURCES.length)
    for (const part of Object.values(COMPONENTS)) {
      const { source } = part
      expect(
        SOURCES.filter((each) => each.name === source.name),
        part.name,
      ).toEqual([source])
    }
  })

  // Scene: the build scripts' commit is an inference from dates (review W4).
  it('gives each source the basis of its commit in words', () => {
    expect(Object.fromEntries(SOURCES.map((source) => [source.name, source.basis]))).toEqual({
      emulatorjs: "the registry's gitHead of both pinned packages",
      melonds: "the commit named in the core's own bytes",
      retroarch: "the commit named in the core's own bytes",
      'emulatorjs-build':
        "inferred from dates: the head of the scripts' main branch around the core's build day",
      emscripten: "inferred: the one Emscripten release whose LLVM commit the core's wasm names",
      zlib: "the tag v1.3.1, the version Emscripten 4.0.8's zlib port names and the core's wasm holds",
      nipplejs: 'the tag v0.10.2, the version the served file equals',
      'socket.io': "the tag socket.io@4.8.1, the version the served file's header names",
    })
  })

  it("names EmulatorJS at the registry's gitHead of both pinned packages", () => {
    const commit = pin('emulatorjs').commit
    expect(PACKAGES.map((pkg) => pkg.gitHead)).toEqual([commit, commit])
  })

  // Scene: a reader can follow the chain from the core's bytes to the pinned source. The wasm
  // names LLVM 23e3cbb, emscripten-releases' DEPS of Emscripten 4.0.8 name that LLVM commit and
  // the emscripten commit beside it, and zlib's port in that commit fetches the tag v1.3.1.
  it('pins Emscripten at the commit beside the LLVM commit the cores name, and zlib at its tag', () => {
    expect(EMSCRIPTEN_LLVM_COMMIT).toBe('23e3cbb2e82b62586266116c8ab77ce68e412cf8')
    expect(pin('emscripten')).toMatchObject({
      repository: 'https://github.com/emscripten-core/emscripten',
      commit: '70404efec4458b60b953bc8f1529f2fa112cdfd1',
    })
    expect(pin('zlib')).toMatchObject({
      repository: 'https://github.com/madler/zlib',
      commit: '51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf',
    })
    expect(COMPONENTS.emscripten.source).toBe(pin('emscripten'))
    expect(COMPONENTS.zlib.source).toBe(pin('zlib'))
  })

  it('names each archive by its source and commit, and knows no other name', () => {
    expect(archiveName(pin('melonds'))).toBe(
      'melonds-18a057d372783b42d7e297b8731f3c3d673cdcab.tar.gz',
    )
    expect(SOURCES.map(archiveName).filter((name) => !isSourceArchive(name))).toEqual([])
    const listed = archiveName(pin('melonds'))
    for (const name of ['melonds.tar.gz', `${listed}.part`, '', 'git/melonds.git', `./${listed}`])
      expect(isSourceArchive(name), name).toBe(false)
  })
})
