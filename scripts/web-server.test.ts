import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveConfig } from 'vite'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ROM_FILES } from '../src/web/rom-files.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { REPO_DIR } from './rom-paths.ts'
import { FS_DENY, romServer } from './web-server.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

const PATCH = new Uint8Array([0x42, 0x50, 0x53, 0x31, 0, 1, 2, 3, 0xff])
const SLOT_JSON = '{"slotVersion":1}\n'
const MISSING_TAIL = 'irv-emerald.bps is missing: run npm run rom:build'

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

async function start(dir: string): Promise<string> {
  const server = await listen(installed(romServer(dir), 'configureServer'))
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
    expect(installed(plugin, 'configureServer')).toHaveLength(2)
    expect(installed(plugin, 'configurePreviewServer')).toHaveLength(2)
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

describe('the file guard for /@fs/', () => {
  it('keeps every default of Vite', async () => {
    const defaults = await resolveConfig({ configFile: false, logLevel: 'silent' }, 'serve')
    expect(FS_DENY).toEqual(expect.arrayContaining(defaults.server.fs.deny))
  })

  it('denies the build, the pinned tree and ROM files', () => {
    expect(FS_DENY).toEqual(
      expect.arrayContaining([
        '**/build/**',
        '**/.cache/**',
        '**/*.gba',
        '**/*.elf',
        '**/*.sav',
        '**/*.ss[0-9]',
        '**/*.bps',
      ]),
    )
  })

  it('is what vite.config.ts hands to the dev server, with the plugin', async () => {
    const config = await resolveConfig({ logLevel: 'silent' }, 'serve')
    expect(config.server.fs.deny).toEqual(FS_DENY)
    expect(config.server.allowedHosts).toEqual(['.ts.net'])
    expect(config.plugins.map((plugin) => plugin.name)).toContain('irv-rom-server')
  })
})
