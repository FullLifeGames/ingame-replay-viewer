// The dev and preview server for the page (plan S5b §2): every response is cross-origin isolated,
// which the emulator's threads need, and /rom/ serves the patch and the slot description straight
// from build/rom/ and nothing else there. /wasm/ serves the WebAssembly spike's glue and module
// patch from build/wasm/ (#35), never the module. Nothing is copied into src/ or dist/ (ADR 0002).
import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, join, relative } from 'node:path'

import type { Plugin } from 'vite'

import { ROM_FILES } from '../src/web/rom-files.ts'
import { WASM_FILES } from '../src/web/wasm/files.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { buildPaths, REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'
import { LINK_OUTPUTS, WASM_BUILD_STEPS } from './wasm-link.ts'
import { WASM_OUTPUT_NAMES } from './wasm-outputs.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

// Vite's own list (server.fs.deny replaces it, so it is repeated; a spec holds it complete) and
// what /@fs/ must never reach: the build outputs, the pinned tree, ROMs, saves and savestates.
// build/ and .cache/ are the repository's own; the @pkmn packages ship their code in a build/.
export const FS_DENY = [
  '.env',
  '.env.*',
  '*.{crt,pem,key,p12,pfx,cer,der}',
  '.npmrc',
  '.yarnrc.yml',
  '**/.git/**',
  `${REPO_DIR}/build/**`,
  `${REPO_DIR}/.cache/**`,
  '**/*.gba',
  '**/*.elf',
  '**/*.sav',
  '**/*.ss[0-9]',
  '**/*.bps',
]

interface Route {
  name: string
  type: string
}

/** One prefix: the names it serves from `dir`, and the command that makes them. */
interface Mount {
  prefix: string
  routes: Map<string, Route>
  dir: string
  build: string
  /** A name under the prefix that the server passes on to Vite instead of refusing it. */
  passOn?: (path: string) => boolean
}

const BINARY = 'application/octet-stream'

const romMount = (dir: string): Mount => ({
  prefix: '/rom/',
  routes: new Map([
    [`/${ROM_FILES.patch}`, { name: OUTPUT_NAMES.patch, type: BINARY }],
    [`/${ROM_FILES.slot}`, { name: OUTPUT_NAMES.slot, type: 'application/json' }],
  ]),
  dir,
  build: 'npm run rom:build',
})

// In dev, Vite serves the spike page's own modules (src/web/wasm/) under the same prefix.
const PAGE_WASM_DIR = join(REPO_DIR, 'src', 'web', 'wasm')
const isPageModule = (path: string) =>
  statSync(join(PAGE_WASM_DIR, path.slice('/wasm/'.length)), {
    throwIfNoEntry: false,
  })?.isFile() === true

const wasmMount = (dir: string): Mount => ({
  prefix: '/wasm/',
  routes: new Map([
    [`/${WASM_FILES.glue}`, { name: LINK_OUTPUTS.js, type: 'text/javascript' }],
    [`/${WASM_FILES.patch}`, { name: WASM_OUTPUT_NAMES.patch, type: BINARY }],
  ]),
  dir,
  build: WASM_BUILD_STEPS,
  passOn: isPageModule,
})

const isolate: Middleware = (_req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  next()
}

function shown(path: string): string {
  const inRepo = relative(REPO_DIR, path)
  return inRepo.startsWith('..') || isAbsolute(inRepo) ? path : inRepo
}

function answer(res: ServerResponse, status: number, line: string): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.end(`${line}\n`)
}

const missing = (path: string, build: string): string => `${shown(path)} is missing: run ${build}`

// pipe() does not pass a read error on, and an unhandled one would end the server. Before the
// first byte the answer is still the 404 line; after it, the response can only be cut off.
function stream(res: ServerResponse, path: string, build: string): void {
  createReadStream(path)
    .on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error)
        return
      }
      res.removeHeader('Content-Length')
      answer(res, 404, missing(path, build))
    })
    .pipe(res)
}

function sendFile(req: IncomingMessage, res: ServerResponse, mount: Mount, route: Route): void {
  const path = join(mount.dir, route.name)
  const size = statSync(path, { throwIfNoEntry: false })?.size
  if (size === undefined) {
    answer(res, 404, missing(path, mount.build))
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', route.type)
  res.setHeader('Content-Length', size)
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'HEAD') res.end()
  else stream(res, path, mount.build)
}

function mounted(mount: Mount): Middleware {
  const { prefix, routes } = mount
  return (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    const route = routes.get(path)
    if (!path.startsWith(prefix) || (route === undefined && mount.passOn?.(path) === true)) {
      next()
    } else if (route === undefined) {
      answer(res, 404, `${path} is not served: only ${[...routes.keys()].join(' and ')}`)
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      answer(res, 405, `${path} answers GET and HEAD only`)
    } else {
      sendFile(req, res, mount, route)
    }
  }
}

// The middlewares go in before Vite's own, so they see every request first, its 404s included.
export function romServer(
  dir: string = buildPaths().outDir,
  wasmDir: string = wasmPaths(REPO_DIR).out,
): Plugin {
  const install = (server: { middlewares: { use: (fn: Middleware) => unknown } }) => {
    server.middlewares.use(isolate)
    server.middlewares.use(mounted(romMount(dir)))
    server.middlewares.use(mounted(wasmMount(wasmDir)))
  }
  return { name: 'irv-rom-server', configureServer: install, configurePreviewServer: install }
}
