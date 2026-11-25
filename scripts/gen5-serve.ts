// The Gen 5 spike page's servers (#72). By default Vite's dev server on src/web/gen5/, for the
// shot script, with /emulatorjs/* served from the fetched packages in .cache/gen5/emulatorjs/site/
// (scripts/gen5-fetch.ts), /saves/* from src/web/gen5/saves/ alone and /source/* from the source
// archives in .cache/gen5/sources/ (scripts/gen5-sources.ts), and /licences.html made from them
// (scripts/gen5-licences-read.ts). With --built it builds the page and serves the build instead,
// for the user's own check (scripts/gen5-built.ts). Every answer is cross-origin isolated, which
// the core's thread build needs. Both bind to 127.0.0.1 unless the command line says --host.
// Usage: node scripts/gen5-serve.ts [--host] | --built [--host] [--port N]
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

import { createServer, type InlineConfig, type Plugin, type ViteDevServer } from 'vite'

import { BUILT_PORT, buildGen5Page, builtServerOptions, startBuiltServer } from './gen5-built.ts'
import { SAVES_PREFIX } from '../src/gen5/save-file.ts'
import {
  ISOLATION,
  LICENCES_PAGE,
  savesFileFor,
  sendFile,
  SITE_PREFIX,
  siteFileFor,
  SOURCE_PREFIX,
  sourceFileFor,
} from './gen5-files.ts'
import { licencesHtml } from './gen5-licences.ts'
import { readLicencesInput } from './gen5-licences-read.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** Lane a's port (plan section 0); Vite moves to the next free one above it if it is taken. */
const PORT = 5183

const LICENCES_PATH = `/${LICENCES_PAGE}`

/** Vite's own deny list, plus what /@fs/ must never reach: outputs, fetched files, dumps, saves.
 * Vite checks it for files under the root too, so the saves' own middleware answers first. */
const FS_DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '**/.git/**',
  `${GEN5_PATHS.repo}/build/**`,
  `${GEN5_PATHS.repo}/.cache/**`,
  '**/*.nds',
  '**/*.sav',
]

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

/** Answers the requests under `prefix` with the file `fileOf` maps, or a 404; passes the rest. */
function mount(prefix: string, fileOf: (url: string) => string | undefined): Middleware {
  return (req, res, next) => {
    const url = req.url ?? ''
    if (!url.startsWith(prefix)) {
      next()
      return
    }
    sendFile(res, fileOf(url), url.split('?')[0] ?? '')
  }
}

/** Answers /licences.html with `page`, the licences page the build writes (#79), made afresh on
 * each request; a 500 that says why when it cannot be made. Passes the rest. */
export function licencesMount(page: () => string): Middleware {
  return (req, res, next) => {
    if ((req.url ?? '').split('?')[0] !== LICENCES_PATH) {
      next()
      return
    }
    const head = { ...ISOLATION, 'Cache-Control': 'no-store' }
    try {
      const html = page()
      res.writeHead(200, { ...head, 'Content-Type': 'text/html' })
      res.end(html)
    } catch (error) {
      res.writeHead(500, { ...head, 'Content-Type': 'text/plain' })
      res.end(`gen5: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

/** The four mounts answer before Vite's own middlewares. */
const emulatorjsMount: Plugin = {
  name: 'gen5-emulatorjs',
  configureServer(server) {
    server.middlewares.use(mount(SITE_PREFIX, (url) => siteFileFor(url, GEN5_PATHS.site)))
    server.middlewares.use(mount(SAVES_PREFIX, (url) => savesFileFor(url, GEN5_PATHS.saves)))
    server.middlewares.use(mount(SOURCE_PREFIX, (url) => sourceFileFor(url, GEN5_PATHS.sources)))
    server.middlewares.use(licencesMount(() => licencesHtml(readLicencesInput(GEN5_PATHS.sources))))
  },
}

/** The dev server's config; `host` true listens on every interface. */
export function gen5ServerConfig(host: boolean): InlineConfig {
  return {
    configFile: false,
    root: GEN5_PATHS.page,
    cacheDir: join(GEN5_PATHS.runs, '..', 'vite-cache'),
    logLevel: 'warn',
    plugins: [emulatorjsMount],
    server: {
      host: host ? true : '127.0.0.1',
      port: PORT,
      headers: ISOLATION,
      fs: { deny: FS_DENY },
    },
  }
}

/** Starts the page's dev server; `host` true listens on every interface. */
export async function startGen5Server(host = false): Promise<ViteDevServer> {
  const server = await createServer(gen5ServerConfig(host))
  await server.listen()
  return server
}

async function serveBuilt(argv: readonly string[]): Promise<void> {
  const options = builtServerOptions(argv)
  await buildGen5Page()
  await startBuiltServer(options)
  const where = options.host ? 'every interface' : '127.0.0.1'
  process.stdout.write(
    `gen5-serve: the built page on ${where}, port ${String(options.port)} (default ${String(BUILT_PORT)})\n`,
  )
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('--built')) {
    await serveBuilt(argv)
    return
  }
  const server = await startGen5Server(argv.includes('--host'))
  server.printUrls()
}

if (import.meta.main) await main()
