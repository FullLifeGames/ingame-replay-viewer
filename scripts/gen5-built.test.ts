import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Script } from 'node:vm'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BUILT_PORT,
  builtServerOptions,
  bundleUnpacker,
  startBuiltServer,
  writeUnpackerScript,
} from './gen5-built'
import { writeLicencesPage } from './gen5-licences-read'
import { archiveName, COMPONENTS, SITE_FILES } from './gen5-manifest'
import { GEN5_PATHS } from './gen5-paths'
import { DONE, FILE, UNPACK_REPORT, type UnpackGlobal } from '../src/gen5/core-unpack'
import { UNPACKER_PATH, UNPACKER_SCRIPT } from '../src/gen5/unpacker'
import { fromBase64 } from '../src/gen5/lzma.fixtures'
import { ARCHIVES } from '../src/gen5/seven-zip.fixtures'

describe('builtServerOptions', () => {
  it('binds to loopback on port 5184 unless told otherwise', () => {
    expect(BUILT_PORT).toBe(5184)
    expect(builtServerOptions(['--built'])).toEqual({ host: false, port: 5184 })
  })

  it('reads --host and --port', () => {
    expect(builtServerOptions(['--built', '--host', '--port', '5190'])).toEqual({
      host: true,
      port: 5190,
    })
  })

  it('refuses a port that is no port', () => {
    expect(() => builtServerOptions(['--port', 'abc'])).toThrow('port')
    expect(() => builtServerOptions(['--port', '70000'])).toThrow('port')
  })
})

// On 22.11.2026 a phone's file picker greyed out the Gen 3 dump because the input said
// accept=".gba" (src/web/pages.test.ts holds that rule for the Gen 3 pages). The spike page checks
// the header itself (src/gen5/nds-header.ts), so its input takes any file.
describe('the spike page', () => {
  const html = readFileSync(`${GEN5_PATHS.page}/index.html`, 'utf8')

  it('lets the picker offer any file', () => {
    const input = /<input id="dump"[^>]*>/.exec(html)?.[0]
    expect(input).toBeDefined()
    expect(input).not.toMatch(/accept/i)
  })

  // Scene: the notice stands before the file input (#79, GPL-3.0 section 5(d)).
  it('shows the GPL notice before the file input and links the licences page', () => {
    const notice = /<section id="licence-notice">(.*?)<\/section>/s.exec(html)
    expect(notice).not.toBeNull()
    expect(notice?.index).toBeLessThan(html.indexOf('<input id="dump"'))
    const text = (notice?.[1] ?? '').replace(/\s+/g, ' ')
    for (const words of [
      'GNU General Public License, version 3',
      `EmulatorJS ${COMPONENTS.emulatorjs.version}`,
      'melonDS',
      'RetroArch',
      'no warranty',
      '<a href="licences.html">',
    ]) {
      expect(text).toContain(words)
    }
  })

  it('shows the speed cap, the core switch, the copy button and the phone note', () => {
    for (const id of ['uncapped', 'core-switch', 'vsync-switch', 'copy', 'figures', 'phone-note']) {
      expect(html).toContain(`id="${id}"`)
    }
  })
})

// Scene: the server answers 404 outside the manifest (scripts/gen5-manifest.ts).
describe('startBuiltServer', () => {
  const root = mkdtempSync(join(tmpdir(), 'gen5-built-'))
  const folders = {
    built: join(root, 'page'),
    site: join(root, 'site'),
    saves: join(root, 'saves'),
    sources: join(root, 'sources'),
    bw2Json: join(root, 'build', 'bw2.json'),
    routineJson: join(root, 'build', 'routine.json'),
  }
  const archive = archiveName(COMPONENTS.melonds.source)
  let server: Server | undefined

  beforeAll(async () => {
    for (const file of [
      'page/index.html',
      'site/data/loader.js',
      'site/data/version.json',
      'site/data/compression/extract7z.js',
      `page/${UNPACKER_SCRIPT}`,
      `sources/${archive}`,
      'sources/other.tar.gz',
    ]) {
      mkdirSync(join(root, file, '..'), { recursive: true })
      writeFileSync(join(root, file), 'x')
    }
    mkdirSync(join(root, 'build'))
    writeFileSync(folders.bw2Json, '{"numbers":"invented"}')
    writeFileSync(folders.routineJson, '{"routine":"invented"}')
    writeLicencesPage(folders.built, {
      build: { commit: '1'.repeat(40), date: '2026-11-25', dirty: false },
      components: COMPONENTS,
      files: SITE_FILES,
      archives: [],
      notices: [],
      trees: [],
      unfound: [],
      gpl: 'invented',
      viewerLicence: 'invented',
    })
    server = await startBuiltServer({ host: false, port: 0 }, folders)
  })

  afterAll(() => {
    server?.close()
    rmSync(root, { recursive: true, force: true })
  })

  const base = () => `http://127.0.0.1:${String((server?.address() as AddressInfo).port)}`
  const answer = async (path: string): Promise<Response> => {
    const response = await fetch(`${base()}${path}`)
    await response.arrayBuffer()
    return response
  }
  const status = async (path: string): Promise<number> => (await answer(path)).status

  it('answers a file the manifest serves and the page itself', async () => {
    expect(await status('/emulatorjs/data/loader.js')).toBe(200)
    expect(await status('/')).toBe(200)
  })

  it('answers the licences page the build writes as HTML', async () => {
    const response = await answer('/licences.html')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html')
  })

  it('names the size of an archive, so a HEAD answers it', async () => {
    const response = await fetch(`${base()}/source/${archive}`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe('1')
  })

  it('answers 404 for a file of the site the manifest does not list', async () => {
    expect(await status('/emulatorjs/data/version.json')).toBe(404)
  })

  // Scene: the page names its own worker for EmulatorJS's unpacker (79-4b).
  it("answers the page's unpacker as JavaScript, and 404 for EmulatorJS's", async () => {
    const response = await answer(UNPACKER_PATH)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/javascript')
    expect(await status('/emulatorjs/data/compression/extract7z.js')).toBe(404)
  })

  // Scene: the page fetches the numbers and the routine from build/gen5/, outside page/ (#111).
  it('answers both build files from outside the built page as JSON', async () => {
    for (const [path, file] of [
      ['/gen5-build/bw2.json', folders.bw2Json],
      ['/gen5-build/routine.json', folders.routineJson],
    ] as const) {
      const response = await fetch(`${base()}${path}`)
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toBe('application/json')
      expect(await response.text(), path).toBe(readFileSync(file, 'utf8'))
    }
  })

  it('answers 404 for both build files at the root, where the built page holds neither', async () => {
    expect(await status('/bw2.json')).toBe(404)
    expect(await status('/routine.json')).toBe(404)
    expect(await status('/gen5-build/other.json')).toBe(404)
  })

  it('answers an archive the manifest names as gzip, and 404 for another name', async () => {
    const response = await answer(`/source/${archive}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/gzip')
    expect(await status('/source/other.tar.gz')).toBe(404)
  })
})

// Scene: Vite copies a public/ folder and bundles every import into build/gen5/page/; neither may
// carry a build file into the page's output (#111).
describe("the page's build output", () => {
  const sources = readdirSync(GEN5_PATHS.page, { recursive: true, encoding: 'utf8' }).filter(
    (file) => file.endsWith('.ts'),
  )

  it('holds neither build file: no page module imports from build/ and there is no public/', () => {
    expect(sources).toContain('main.ts')
    const importsBuild = /(?:\bfrom\s*|\bimport\s*\(\s*)['"`][^'"`]*\bbuild\//
    const importing = sources.filter((file) =>
      importsBuild.test(readFileSync(join(GEN5_PATHS.page, file), 'utf8')),
    )
    expect(importing).toEqual([])
    expect(existsSync(join(GEN5_PATHS.page, 'public'))).toBe(false)
  })
})

interface Posted {
  message: { t: number; file?: string; data?: Uint8Array }
  transfer: readonly ArrayBuffer[]
}

type Scope = { onmessage?: (event: { data: unknown }) => void } & UnpackGlobal &
  Record<string, unknown>

/** Runs `script` as EmulatorJS runs its unpacker: a classic script (a module's import or export
 * fails to compile here) whose global scope is `self`, then one message with the archive. Gives
 * the posts and the scope the script left behind. */
function runClassic(script: string, archive: Uint8Array): { posted: Posted[]; scope: Scope } {
  const posted: Posted[] = []
  const scope: Scope = {
    postMessage: (message: Posted['message'], options: { transfer: ArrayBuffer[] }) =>
      posted.push({ message, transfer: options.transfer }),
  }
  new Script(script).runInNewContext({ self: scope, performance, TextDecoder })
  scope.onmessage?.({ data: archive })
  return { posted, scope }
}

// Scene: EmulatorJS fetches the unpacker as text and starts it from a Blob URL as a classic
// worker, so the script must stand alone: no import, no export, no module.
describe('the unpacker script', () => {
  let script = ''

  beforeAll(async () => {
    script = await bundleUnpacker()
  }, 60_000)

  it('is one classic script that unpacks an archive in EmulatorJS shapes', () => {
    expect(script).not.toMatch(/^\s*(import|export)\b/m)
    const { posted } = runClassic(script, fromBase64(ARCHIVES.encodedHeader))
    expect(posted.map(({ message }) => [message.t, message.file])).toEqual([
      [4, undefined],
      [FILE, 'alpha.txt'],
      [4, undefined],
      [FILE, 'beta/zeros.bin'],
      [DONE, undefined],
    ])
    expect(posted[1]?.transfer).toEqual([posted[1]?.message.data?.buffer])
  })

  // Scene: scripts/gen5-page.ts reads the unpack report from the worker under the name that
  // src/gen5/core-unpack.ts gives it (review W3).
  it('leaves its report on its global scope under the name the scripts read', () => {
    const { scope } = runClassic(script, fromBase64(ARCHIVES.encodedHeader))
    expect(scope[UNPACK_REPORT]).toEqual({
      files: 2,
      bytes: 5500,
      ms: expect.any(Number) as number,
    })
  })

  it('is what the build writes beside the page', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gen5-unpacker-'))
    try {
      await writeUnpackerScript(dir)
      expect(readFileSync(join(dir, UNPACKER_SCRIPT), 'utf8')).toBe(script)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 60_000)

  it('is the script the page names for extract7z.js through window.EJS_paths', () => {
    const main = readFileSync(`${GEN5_PATHS.page}/main.ts`, 'utf8')
    expect(main).toContain('window.EJS_paths = emulatorPaths()')
    expect(main.indexOf('window.EJS_paths')).toBeLessThan(main.indexOf('loader.js'))
  })
})
