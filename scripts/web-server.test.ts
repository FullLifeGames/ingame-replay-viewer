import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { isFileLoadingAllowed, resolveConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROM_FILES } from '../src/web/rom-files.ts'
import { WASM_FILES } from '../src/web/wasm/files.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { REPO_DIR } from './rom-paths.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'
import { WASM_OUTPUT_NAMES } from './wasm-outputs.ts'
import { FS_DENY, romServer } from './web-server.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const PATCH = new Uint8Array([0x42, 0x50, 0x53, 0x31, 0, 1, 2, 3, 0xff])
const SLOT_JSON = '{"slotVersion":1}\n'
const MISSING_TAIL = 'irv-emerald.bps is missing: run npm run rom:build'
const GLUE = 'export default async function factory() {}\n'

// The hooks as Vite calls them: a server object whose middlewares collect what the plugin adds.
function installed(plugin: Plugin, hook: 'configureServer' | 'configurePreviewServer') {
  const added: Middleware[] = []
  const server = { middlewares: { use: (fn: Middleware) => added.push(fn) } }
  const run = plugin[hook] as (server: ViteDevServer & PreviewServer) => void
  run.call(undefined, server as unknown as ViteDevServer & PreviewServer)
  return added
}

// A real HTTP server around the middlewares; what they pass on ends in a plain 404 "next".
function listen(middlewares: Middleware[]): Promise<Server> {
  const server = createServer((req, res) => {
    const step = (index: number) => {
      const middleware = middlewares[index]
      if (middleware === undefined) {
        res.statusCode = 404
        res.end('next')
        return
      }
      middleware(req, res, () => {
        step(index + 1)
      })
    }
    step(0)
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => {
      done(server)
    })
  })
}

const scratch = mkdtempSync(join(tmpdir(), 'irv-web-server-'))
const full = join(scratch, 'full')
const empty = join(scratch, 'empty')
const servers: Server[] = []
let fullBase = ''
let emptyBase = ''

async function start(dir: string, wasmDir: string = join(dir, 'wasm')): Promise<string> {
  const server = await listen(installed(romServer(dir, wasmDir), 'configureServer'))
  servers.push(server)
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
}

beforeAll(async () => {
  mkdirSync(full)
  mkdirSync(empty)
  writeFileSync(join(full, OUTPUT_NAMES.patch), PATCH)
  writeFileSync(join(full, OUTPUT_NAMES.slot), SLOT_JSON)
  for (const name of [OUTPUT_NAMES.rom, OUTPUT_NAMES.elf, OUTPUT_NAMES.map, OUTPUT_NAMES.info]) {
    writeFileSync(join(full, name), 'ROM-derived')
  }
  mkdirSync(join(full, 'wasm'))
  writeFileSync(join(full, 'wasm', LINK_OUTPUTS.js), GLUE)
  writeFileSync(join(full, 'wasm', WASM_OUTPUT_NAMES.patch), PATCH)
  for (const name of [LINK_OUTPUTS.wasm, 'link.md', 'compile.json']) {
    writeFileSync(join(full, 'wasm', name), 'ROM-derived')
  }
  fullBase = await start(full)
  emptyBase = await start(empty)
})

afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise((done) => server.close(done))))
  rmSync(scratch, { recursive: true, force: true })
})

function expectIsolated(response: Response) {
  expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
  expect(response.headers.get('cross-origin-embedder-policy')).toBe('require-corp')
}

describe('the dev server plugin', () => {
  it('names the routes after the build outputs', () => {
    expect(ROM_FILES).toEqual({
      patch: `rom/${OUTPUT_NAMES.patch}`,
      slot: `rom/${OUTPUT_NAMES.slot}`,
    })
  })

  it('installs the same middlewares in dev and in preview', () => {
    const plugin = romServer(full)
    expect(installed(plugin, 'configureServer')).toHaveLength(3)
    expect(installed(plugin, 'configurePreviewServer')).toHaveLength(3)
  })

  it('serves the patch from the build folder, uncached', async () => {
    const response = await fetch(`${fullBase}/${ROM_FILES.patch}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PATCH)
    expectIsolated(response)
  })

  it('serves the slot description as JSON, also with a query', async () => {
    const response = await fetch(`${fullBase}/${ROM_FILES.slot}?t=1`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.text()).toBe(SLOT_JSON)
  })

  it('answers HEAD with the length and no body', async () => {
    const response = await fetch(`${fullBase}/${ROM_FILES.patch}`, { method: 'HEAD' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-length')).toBe(String(PATCH.length))
    expect(await response.text()).toBe('')
  })

  it('refuses every other build output even though the file is there', async () => {
    for (const name of [OUTPUT_NAMES.rom, OUTPUT_NAMES.elf, OUTPUT_NAMES.map, OUTPUT_NAMES.info]) {
      const response = await fetch(`${fullBase}/rom/${name}`)
      expect(response.status, name).toBe(404)
      expect(await response.text()).not.toContain('ROM-derived')
      expectIsolated(response)
    }
  })

  it('refuses a path that climbs out of /rom/', async () => {
    const response = await fetch(`${fullBase}/rom/%2e%2e/rom/${OUTPUT_NAMES.rom}`)
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('ROM-derived')
  })

  it('refuses a write to a served name', async () => {
    const response = await fetch(`${fullBase}/${ROM_FILES.patch}`, { method: 'POST' })
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET, HEAD')
  })

  it('names the build command when the patch is missing', async () => {
    const response = await fetch(`${emptyBase}/${ROM_FILES.patch}`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toMatch(new RegExp(`${MISSING_TAIL}\n$`))
    expectIsolated(response)
  })

  // rom:build empties build/rom/ at its start: the stat passes, the read fails. A folder in the
  // patch's place does the same, and the server has to answer instead of crashing.
  it('answers 404 with the build command when the file cannot be read after its stat', async () => {
    const broken = join(scratch, 'broken')
    mkdirSync(join(broken, OUTPUT_NAMES.patch), { recursive: true })
    const base = await start(broken)
    const response = await fetch(`${base}/${ROM_FILES.patch}`)
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toBe(`${join(broken, MISSING_TAIL)}\n`)
    expectIsolated(response)
    expect((await fetch(`${fullBase}/${ROM_FILES.slot}`)).status).toBe(200)
  })

  it('names a folder inside the repository by its repository path', async () => {
    const inside = await start(join(REPO_DIR, 'build', 'no-such-folder'))
    const response = await fetch(`${inside}/${ROM_FILES.slot}`)
    expect(await response.text()).toBe(
      `build/no-such-folder/${OUTPUT_NAMES.slot} is missing: run npm run rom:build\n`,
    )
  })

  it('names a folder outside the repository by its full path', async () => {
    const response = await fetch(`${emptyBase}/${ROM_FILES.patch}`)
    expect(await response.text()).toBe(`${join(empty, MISSING_TAIL)}\n`)
  })

  it('passes other paths on, with the isolation headers set', async () => {
    const response = await fetch(`${fullBase}/index.html`)
    expect(await response.text()).toBe('next')
    expectIsolated(response)
  })
})

describe('the WebAssembly spike files', () => {
  it('names the routes after the build outputs', () => {
    expect(WASM_FILES).toEqual({
      glue: `wasm/${LINK_OUTPUTS.js}`,
      patch: `wasm/${WASM_OUTPUT_NAMES.patch}`,
    })
  })

  it('serves the glue as JavaScript and the module patch from build/wasm, uncached', async () => {
    const glue = await fetch(`${fullBase}/${WASM_FILES.glue}`)
    expect(glue.status).toBe(200)
    expect(glue.headers.get('content-type')).toBe('text/javascript')
    expect(glue.headers.get('cache-control')).toBe('no-store')
    expect(await glue.text()).toBe(GLUE)
    expectIsolated(glue)
    const patch = await fetch(`${fullBase}/${WASM_FILES.patch}`)
    expect(patch.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await patch.arrayBuffer())).toEqual(PATCH)
  })

  it('refuses the module itself and every other file of build/wasm', async () => {
    for (const name of [LINK_OUTPUTS.wasm, 'link.md', 'compile.json', 'no-such-file']) {
      const response = await fetch(`${fullBase}/wasm/${name}`)
      expect(response.status, name).toBe(404)
      expect(await response.text()).toBe(
        `/wasm/${name} is not served: only /${WASM_FILES.glue} and /${WASM_FILES.patch}\n`,
      )
      expectIsolated(response)
    }
  })

  // In dev, Vite serves the page's own modules of src/web/wasm/ under the same /wasm/ prefix.
  it("passes the spike page's own modules on to Vite", async () => {
    for (const name of ['main.ts', 'worker.ts?worker_file&type=module', 'protocol.ts']) {
      const response = await fetch(`${fullBase}/wasm/${name}`)
      expect(await response.text(), name).toBe('next')
    }
    const climbing = await fetch(`${fullBase}/wasm/..%2fmain.ts`)
    expect(climbing.status).toBe(404)
    expect(await climbing.text()).not.toBe('next')
  })

  it('names the link when the glue or the patch is missing', async () => {
    const response = await fetch(`${emptyBase}/${WASM_FILES.glue}`)
    expect(response.status).toBe(404)
    expect(await response.text()).toBe(
      `${join(empty, 'wasm', LINK_OUTPUTS.js)} is missing: run npm run wasm:build -- --link\n`,
    )
  })
})

describe('the file guard for /@fs/', () => {
  it('keeps every default of Vite', async () => {
    const defaults = await resolveConfig({ configFile: false, logLevel: 'silent' }, 'serve')
    expect(FS_DENY).toEqual(expect.arrayContaining(defaults.server.fs.deny))
  })

  // The @pkmn packages ship their code in build/; only the repository's own build/ is ROM-derived.
  it("denies the repository's build and pinned tree, and lets node_modules' build/ through", async () => {
    const config = await resolveConfig({ logLevel: 'silent' }, 'serve')
    const allowed = (path: string) => isFileLoadingAllowed(config, join(REPO_DIR, path))
    expect(allowed('build/rom/irv-emerald.bps')).toBe(false)
    expect(allowed('build/rom/replay-slot.json')).toBe(false)
    expect(allowed('.cache/rom/expansion/graphics/pokemon/zapdos/front.png')).toBe(false)
    expect(allowed('node_modules/@pkmn/dex/build/index.mjs')).toBe(true)
    expect(allowed('node_modules/@pkmn/protocol/build/index.mjs')).toBe(true)
    expect(allowed('src/web/main.ts')).toBe(true)
  })

  it('denies ROM files anywhere', () => {
    expect(FS_DENY).toEqual(
      expect.arrayContaining(['**/*.gba', '**/*.elf', '**/*.sav', '**/*.ss[0-9]', '**/*.bps']),
    )
  })

  it('is what vite.config.ts hands to the dev server, with the plugin', async () => {
    const config = await resolveConfig({ logLevel: 'silent' }, 'serve')
    expect(config.server.fs.deny).toEqual(FS_DENY)
    expect(config.server.allowedHosts).toEqual(['.ts.net'])
    expect(config.plugins.map((plugin) => plugin.name)).toContain('irv-rom-server')
  })
})

describe('the emulator package in the dev server', () => {
  // mgba.js finds its pthread worker and its wasm beside itself (new URL(..., import.meta.url)),
  // which a pre-bundled copy in node_modules/.vite would break.
  it('stays out of the dependency optimizer', async () => {
    const config = await resolveConfig({ logLevel: 'silent' }, 'serve')
    expect(config.optimizeDeps.exclude).toContain('@thenick775/mgba-wasm')
  })
})
