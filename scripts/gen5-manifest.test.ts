import { describe, expect, it } from 'vitest'

import { PACKAGES } from './gen5-fetch'
import {
  archiveName,
  COMPONENTS,
  type Component,
  isListed,
  isServedSitePath,
  isSourceArchive,
  OWN_FILES,
  SITE_FILES,
  SOURCES,
} from './gen5-manifest'
import { checkManifest, type ManifestDraft } from './gen5-manifest-check'
import { UNPACKER_PATH } from '../src/gen5/core-unpack'

const SOURCE = {
  name: 'tool',
  repository: 'https://github.com/example/tool',
  commit: 'a'.repeat(40),
  tar: 'b'.repeat(64),
  basis: 'the tag v1.0.0',
}
const TOOL: Component = {
  name: 'Tool',
  version: '1.0.0',
  licence: 'MIT',
  from: '@example/tool@1.0.0',
  source: SOURCE,
  notices: [{ part: 'Tool', path: 'LICENSE', kind: 'licence' }],
}

/** The source of that name in SOURCES; throws when there is none. */
function pin(name: string) {
  const found = SOURCES.find((source) => source.name === name)
  if (found === undefined) throw new Error(`no source ${name}`)
  return found
}

function draft(tool: Partial<Component>, paths: readonly [string, string[]][]): ManifestDraft {
  return {
    components: { tool },
    files: paths.map(([path, components]) => ({ path, components })),
  }
}

describe('checkManifest', () => {
  it('passes an invented manifest whose every file names a component with licence and source', () => {
    expect(() => {
      checkManifest(draft(TOOL, [['data/tool.js', ['tool']]]))
    }).not.toThrow()
  })

  // Scene: a manifest entry without licence or source.
  it('fails a component without a licence, naming the file and the component', () => {
    const { name, version, from, source } = TOOL
    expect(() => {
      checkManifest(draft({ name, version, from, source }, [['data/tool.js', ['tool']]]))
    }).toThrow('data/tool.js: the component tool names no licence')
  })

  it('fails a component without a source, or with a source that names no full commit', () => {
    const { name, version, from, licence } = TOOL
    expect(() => {
      checkManifest(draft({ name, version, from, licence }, [['data/tool.js', ['tool']]]))
    }).toThrow('data/tool.js: the component tool names no source')
    expect(() => {
      checkManifest(
        draft({ ...TOOL, source: { ...SOURCE, commit: 'abc1234' } }, [['a.js', ['tool']]]),
      )
    }).toThrow('a.js: the component tool names no source')
  })

  it('fails a path listed twice and a file that names no component or an unknown one', () => {
    expect(() => {
      checkManifest(
        draft(TOOL, [
          ['a.js', ['tool']],
          ['a.js', ['tool']],
        ]),
      )
    }).toThrow('a.js: listed twice')
    expect(() => {
      checkManifest(draft(TOOL, [['a.js', []]]))
    }).toThrow('a.js: names no component')
    expect(() => {
      checkManifest(draft(TOOL, [['a.js', ['other']]]))
    }).toThrow('a.js: names the unknown component other')
  })

  it('passes the real manifest', () => {
    expect(() => {
      checkManifest({ components: COMPONENTS, files: SITE_FILES })
    }).not.toThrow()
  })
})

describe('the manifest', () => {
  // Scene: the stage-2 run asked for these. The 16 paths under /emulatorjs/ that the request logs
  // of #78's moment run (78-5) and continue run (78-4b) list, the same set in both runs, but
  // data/compression/extract7z.js, for which the page now names its own worker (79-4b).
  const LOGGED = [
    'data/loader.js',
    'data/emulator.css',
    'data/emulator.min.css',
    'data/emulator.min.js',
    'data/src/emulator.js',
    'data/src/GameManager.js',
    'data/src/compression.js',
    'data/src/gamepad.js',
    'data/src/nipplejs.js',
    'data/src/shaders.js',
    'data/src/socket.io.min.js',
    'data/src/storage.js',
    'data/localization/en-US.json',
    'data/cores/reports/melonds.json',
    'data/cores/melonds-wasm.data',
  ]
  const OTHER_CORES = [
    'data/cores/melonds-thread-wasm.data',
    'data/cores/melonds-legacy-wasm.data',
    'data/cores/melonds-thread-legacy-wasm.data',
  ]
  const LOCALES = ['af-FR', 'ar-AR', 'ben-BEN', 'de-GER', 'el-GR', 'en-US', 'es-ES', 'fa-AF']
    .concat(['hi-HI', 'it-IT', 'ja-JA', 'jv-JV', 'ko-KO', 'pt-BR', 'ro-RO', 'ru-RU', 'tr-TR'])
    .concat(['vi-VN', 'zh-CN'])
    .map((code) => `data/localization/${code}.json`)

  it('lists every path the runs asked for, the other three core builds and the 19 locales', () => {
    expect(LOCALES).toHaveLength(19)
    const all = [...LOGGED, ...OTHER_CORES, ...LOCALES]
    expect(all.filter((path) => !isListed(path))).toEqual([])
    expect(SITE_FILES).toHaveLength(new Set(all).size)
  })

  it('serves all of them but the two minified files the site lacks', () => {
    const absent = SITE_FILES.filter((file) => file.presence === 'absent').map((file) => file.path)
    expect(absent).toEqual(['data/emulator.min.css', 'data/emulator.min.js'])
    expect(absent.filter(isServedSitePath)).toEqual([])
    expect(SITE_FILES.filter((file) => file.presence === 'served')).toHaveLength(34)
  })

  it('refuses what the site holds beside them, and a path that is not normalized', () => {
    for (const path of ['data/version.json', 'index.html', 'package.json', 'LICENSE', ''])
      expect(isServedSitePath(path), path).toBe(false)
    expect(isServedSitePath('data/compression/extractzip.js')).toBe(false)
    expect(isServedSitePath('./data/loader.js')).toBe(false)
    expect(isListed('data/version.json')).toBe(false)
  })

  // Scene: the page unpacks the core in a worker of its own (79-4b), so EmulatorJS's unpacker,
  // whose licence nobody names (U1), leaves the page.
  it("lists neither EmulatorJS's 7z unpacker nor a component for it", () => {
    expect(isServedSitePath('data/compression/extract7z.js')).toBe(false)
    expect(isListed('data/compression/extract7z.js')).toBe(false)
    expect(Object.keys(COMPONENTS)).not.toContain('extract7z')
    expect(Object.values(COMPONENTS).map((part) => part.name)).not.toContain(
      "EmulatorJS's 7z unpacker",
    )
  })

  it('names a licence for every component', () => {
    const named = Object.values(COMPONENTS).filter((part) => typeof part.licence === 'string')
    expect(named).toHaveLength(Object.keys(COMPONENTS).length)
  })

  it('takes every component from a pinned package of the fetch script', () => {
    const specs = PACKAGES.map((pkg) => pkg.spec)
    expect(Object.values(COMPONENTS).filter((part) => !specs.includes(part.from))).toEqual([])
  })

  it('names the commits of EmulatorJS, its melonDS and its RetroArch', () => {
    const sources = Object.fromEntries(
      Object.entries(COMPONENTS).map(([id, part]) => [id, part.source]),
    )
    expect(sources).toMatchObject({
      emulatorjs: {
        repository: 'https://github.com/EmulatorJS/EmulatorJS',
        commit: 'e150dc0491ae747028919fb82d6598954976ede6',
      },
      melonds: {
        repository: 'https://github.com/EmulatorJS/melonDS',
        commit: '18a057d372783b42d7e297b8731f3c3d673cdcab',
      },
      retroarch: {
        repository: 'https://github.com/EmulatorJS/RetroArch',
        commit: '6dd4353937ef48b6ec0bfbdbb15d1c5992d86927',
      },
    })
  })

  it('gives each core build melonDS, RetroArch and the build scripts', () => {
    for (const path of ['data/cores/melonds-wasm.data', ...OTHER_CORES]) {
      const file = SITE_FILES.find((entry) => entry.path === path)
      expect(file?.components, path).toEqual(['melonds', 'retroarch', 'build'])
    }
  })

  // Scene: the save is the game's bytes from our play (review U-e), not code under MIT alone.
  it("describes the page's own files, its unpacker and the saves by rule, the save's licence in words", () => {
    expect(OWN_FILES.map((own) => own.licence)).toEqual([
      'MIT',
      'MIT',
      {
        words:
          "The game wrote this save during our play from New Game on the build machine, as docs/gen5-save.md records. We offer it under the repository's MIT licence as far as it is ours.",
      },
    ])
    expect(OWN_FILES.map((own) => own.files).join(' ')).toContain('/saves/<name>.sav')
  })

  // Scene: the worker that stands in for EmulatorJS's unpacker is the viewer's own code.
  it("lists the page's unpacker script as the viewer's code under the repository's licence", () => {
    const unpacker = OWN_FILES.find((own) => own.files.startsWith(`${UNPACKER_PATH},`))
    expect(unpacker).toEqual({
      id: 'unpacker',
      files: `${UNPACKER_PATH}, the viewer's worker that unpacks the emulator's core in place of EmulatorJS's data/compression/extract7z.js`,
      licence: 'MIT',
      source: 'this repository: src/web/gen5/extract7z.ts and the 7z decoder in src/gen5/',
    })
  })

  // Scene: each GPL notice at the pins says "or (at your option) any later version" (review W6).
  it('names each GPL component by the id its notice states, and no plain GPL-3.0', () => {
    const ids = Object.fromEntries(
      Object.entries(COMPONENTS).map(([id, part]) => [id, part.licence]),
    )
    expect(ids).toMatchObject({
      emulatorjs: 'GPL-3.0-or-later',
      melonds: 'GPL-3.0-or-later',
      retroarch: 'GPL-3.0-or-later',
      build: 'GPL-3.0-or-later',
      nipplejs: 'MIT',
      socketio: 'MIT',
    })
    expect(Object.values(ids)).not.toContain('GPL-3.0')
  })

  it('offers a source by commit for every component', () => {
    for (const [id, part] of Object.entries(COMPONENTS))
      expect({ id, commit: part.source.commit }).toEqual({
        id,
        commit: expect.stringMatching(/^[0-9a-f]{40}$/) as unknown,
      })
  })
})

// Scene: every component names its source by commit, and each source gets one archive.
describe('the sources', () => {
  it('fetches each repository once, under its own name, as the components name it', () => {
    expect(SOURCES.map((source) => source.name)).toEqual([
      'emulatorjs',
      'melonds',
      'retroarch',
      'emulatorjs-build',
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
      nipplejs: 'the tag v0.10.2, the version the served file equals',
      'socket.io': "the tag socket.io@4.8.1, the version the served file's header names",
    })
  })

  it("names EmulatorJS at the registry's gitHead of both pinned packages", () => {
    const commit = pin('emulatorjs').commit
    expect(PACKAGES.map((pkg) => pkg.gitHead)).toEqual([commit, commit])
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
