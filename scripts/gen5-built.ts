// The built Gen 5 spike page for the user's own speed check (#72). Vite's dev client reloads a
// page whose websocket dropped, and a phone's file picker backgrounds the browser long enough for
// that, so the page forgot the dump. This builds src/web/gen5/ into build/gen5/page/ and serves
// it with Node's own server: no websocket, no dev client, every answer cross-origin isolated and
// uncached, /emulatorjs/* from the fetched packages as far as scripts/gen5-manifest.ts serves
// them, /source/* the archives it names, and /licences.html, which the build writes from the
// pinned sources (#79). It binds to 127.0.0.1 unless --host.
// Usage: node scripts/gen5-serve.ts --built [--host] [--port N]
import { writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { build } from 'vite'

import { UNPACKER_ENTRY, UNPACKER_SCRIPT } from '../src/gen5/unpacker.ts'
import { fileFor, ISOLATION, sendFile, type ServedFolders } from './gen5-files.ts'
import { readLicencesInput, writeLicencesPage } from './gen5-licences-read.ts'
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

/** The page's unpacker worker (src/web/gen5/extract7z.ts) bundled into one classic script, an
 * IIFE with no import or export: EmulatorJS starts it from a Blob URL, where a module could not
 * load its imports. The dev server answers it from here, the build writes it beside the page. */
export async function bundleUnpacker(): Promise<string> {
  const result = await build({
    configFile: false,
    root: GEN5_PATHS.page,
    cacheDir: join(GEN5_PATHS.runs, '..', 'vite-cache'),
    logLevel: 'warn',
    publicDir: false,
    build: {
      write: false,
      emptyOutDir: false,
      lib: {
        entry: join(GEN5_PATHS.page, UNPACKER_ENTRY),
        formats: ['iife'],
        name: 'gen5Unpacker',
        fileName: () => UNPACKER_SCRIPT,
      },
    },
  })
  const outputs = Array.isArray(result) ? result : 'output' in result ? [result] : []
  const chunks = outputs.flatMap((each) => each.output).filter((file) => file.type === 'chunk')
  if (chunks.length !== 1 || chunks[0] === undefined) {
    throw new Error(
      `gen5-built: the unpacker bundled into ${String(chunks.length)} scripts, not one`,
    )
  }
  return chunks[0].code
}

/** Writes the unpacker's script into `dir` as UNPACKER_SCRIPT. */
export async function writeUnpackerScript(dir: string): Promise<void> {
  writeFileSync(join(dir, UNPACKER_SCRIPT), await bundleUnpacker())
}

/** Builds the page into GEN5_PATHS.built with Vite's build and none of the repository's config,
 * writes the unpacker's script beside it, then the licences page from the pinned sources
 * (scripts/gen5-licences-read.ts); without them it stops. */
export async function buildGen5Page(): Promise<void> {
  const licences = readLicencesInput(GEN5_PATHS.sources)
  await build({
    configFile: false,
    root: GEN5_PATHS.page,
    cacheDir: join(GEN5_PATHS.runs, '..', 'vite-cache'),
    logLevel: 'warn',
    build: { outDir: GEN5_PATHS.built, emptyOutDir: true },
  })
  await writeUnpackerScript(GEN5_PATHS.built)
  writeLicencesPage(GEN5_PATHS.built, licences)
}

/** Serves the built page from `folders`; resolves once it listens. */
export function startBuiltServer(
  options: BuiltServerOptions,
  folders: ServedFolders = GEN5_PATHS,
): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...ISOLATION, Allow: 'GET, HEAD' })
      res.end()
      return
    }
    sendFile(res, fileFor(url, folders), url)
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host ? undefined : '127.0.0.1', () => {
      resolve(server)
    })
  })
}
