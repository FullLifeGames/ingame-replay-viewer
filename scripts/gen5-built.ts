// The built Gen 5 spike page for the user's own speed check (#72). Vite's dev client reloads a
// page whose websocket dropped, and a phone's file picker backgrounds the browser long enough for
// that, so the page forgot the dump. This builds src/web/gen5/ into build/gen5/page/ and serves
// it with Node's own server: no websocket, no dev client, every answer cross-origin isolated and
// uncached, /emulatorjs/* from the fetched packages. It binds to 127.0.0.1 unless --host.
// Usage: node scripts/gen5-serve.ts --built [--host] [--port N]
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { build } from 'vite'

import { fileFor, ISOLATION, sendFile } from './gen5-files.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** The built page's port; the dev server for the shot script keeps 5183. */
export const BUILT_PORT = 5184

export interface BuiltServerOptions {
  /** Listen on every interface, for the user's devices; else loopback only. */
  host: boolean
  port: number
}

export function builtServerOptions(argv: readonly string[]): BuiltServerOptions {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      built: { type: 'boolean', default: false },
      host: { type: 'boolean', default: false },
      port: { type: 'string', default: String(BUILT_PORT) },
    },
  })
  const port = Number(values.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new RangeError(`gen5-built: "${values.port}" is no port`)
  }
  return { host: values.host, port }
}

/** Builds the page into GEN5_PATHS.built with Vite's build and none of the repository's config. */
export async function buildGen5Page(): Promise<void> {
  await build({
    configFile: false,
    root: GEN5_PATHS.page,
    cacheDir: join(GEN5_PATHS.runs, '..', 'vite-cache'),
    logLevel: 'warn',
    build: { outDir: GEN5_PATHS.built, emptyOutDir: true },
  })
}

/** Serves the built page; resolves once it listens. */
export function startBuiltServer(options: BuiltServerOptions): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...ISOLATION, Allow: 'GET, HEAD' })
      res.end()
      return
    }
    sendFile(res, fileFor(url, GEN5_PATHS.built, GEN5_PATHS.site, GEN5_PATHS.saves), url)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host ? undefined : '127.0.0.1', () => {
      resolve(server)
    })
  })
}
