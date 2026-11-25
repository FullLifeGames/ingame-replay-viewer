import { describe, expect, it } from 'vitest'

import { PACKAGES } from './gen5-fetch'
import {
  COMPONENTS,
  type Component,
  isListed,
  isServedSitePath,
  OWN_FILES,
  SITE_FILES,
} from './gen5-manifest'
import { checkManifest, type ManifestDraft, unnamedLicenceFiles } from './gen5-manifest-check'

const SOURCE = { repository: 'https://github.com/example/tool', commit: 'a'.repeat(40) }
const TOOL: Component = {
  name: 'Tool',
  version: '1.0.0',
  licence: 'MIT',
  from: '@example/tool@1.0.0',
  source: SOURCE,
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
  // of #78's moment run (78-5) and continue run (78-4b) list, the same set in both runs.
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
    'data/compression/extract7z.js',
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
    expect(SITE_FILES.filter((file) => file.presence === 'served')).toHaveLength(35)
  })

  it('refuses what the site holds beside them, and a path that is not normalized', () => {
    for (const path of ['data/version.json', 'index.html', 'package.json', 'LICENSE', ''])
      expect(isServedSitePath(path), path).toBe(false)
    expect(isServedSitePath('data/compression/extractzip.js')).toBe(false)
    expect(isServedSitePath('./data/loader.js')).toBe(false)
    expect(isListed('data/version.json')).toBe(false)
  })

  it('names exactly one file whose licence nobody can name: extract7z.js (U1)', () => {
    expect(unnamedLicenceFiles({ components: COMPONENTS, files: SITE_FILES })).toEqual([
      'data/compression/extract7z.js',
    ])
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

  it("describes the page's own files and the saves by rule, under this repository's licence", () => {
    expect(OWN_FILES.map((own) => own.licence)).toEqual(['MIT', 'MIT'])
    expect(OWN_FILES.map((own) => own.files).join(' ')).toContain('/saves/<name>.sav')
  })
})
