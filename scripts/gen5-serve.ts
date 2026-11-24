// The Gen 5 spike page's servers (#72). By default Vite's dev server on src/web/gen5/, for the
// shot script, with /emulatorjs/* served from the fetched packages in .cache/gen5/emulatorjs/site/
// (scripts/gen5-fetch.ts). With --built it builds the page and serves the build instead, for the
// user's own check (scripts/gen5-built.ts). Every answer is cross-origin isolated, which the
// core's thread build needs. Both bind to 127.0.0.1 unless the command line says --host.
// Usage: node scripts/gen5-serve.ts [--host] | --built [--host] [--port N]
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'

import { createServer, type Plugin, type ViteDevServer } from 'vite'

import { BUILT_PORT, buildGen5Page, builtServerOptions, startBuiltServer } from './gen5-built.ts'
import { ISOLATION, sendFile, SITE_PREFIX, siteFileFor } from './gen5-files.ts'
import { GEN5_PATHS } from './gen5-paths.ts'

/** Lane a's port (plan section 0); Vite moves to the next free one above it if it is taken. */
const PORT = 5183

/** Vite's own deny list, plus what /@fs/ must never reach: outputs, fetched files, dumps, saves. */
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

function serveSiteFile(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const url = req.url ?? ''
  if (!url.startsWith(SITE_PREFIX)) {
    next()
    return
  }
  sendFile(res, siteFileFor(url, GEN5_PATHS.site), url.split('?')[0] ?? '')
}

const emulatorjsMount: Plugin = {
  name: 'gen5-emulatorjs',
  configureServer(server) {
    server.middlewares.use(serveSiteFile)
  },
}

/** Starts the page's dev server; `host` true listens on every interface. */
export async function startGen5Server(host = false): Promise<ViteDevServer> {
  const server = await createServer({
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
  })
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
