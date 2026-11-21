// The dev and preview server for the page (plan S5b §2): every response is cross-origin isolated,
// which the emulator's threads need, and /rom/ serves the patch and the slot description straight
// from build/rom/ and nothing else there. Nothing is copied into src/ or dist/ (ADR 0002).
import { createReadStream, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { isAbsolute, join, relative } from 'node:path'

import type { Plugin } from 'vite'

import { ROM_FILES } from '../src/web/rom-files.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { buildPaths, REPO_DIR } from './rom-paths.ts'

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

const ROUTES = new Map([
  [`/${ROM_FILES.patch}`, { name: OUTPUT_NAMES.patch, type: 'application/octet-stream' }],
  [`/${ROM_FILES.slot}`, { name: OUTPUT_NAMES.slot, type: 'application/json' }],
])

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

const missing = (path: string): string => `${shown(path)} is missing: run npm run rom:build`

// pipe() does not pass a read error on, and an unhandled one would end the server. Before the
// first byte the answer is still the 404 line; after it, the response can only be cut off.
function stream(res: ServerResponse, path: string): void {
  createReadStream(path)
    .on('error', (error) => {
      if (res.headersSent) {
        res.destroy(error)
        return
      }
      res.removeHeader('Content-Length')
      answer(res, 404, missing(path))
    })
    .pipe(res)
}

function sendFile(req: IncomingMessage, res: ServerResponse, path: string, type: string): void {
  const size = statSync(path, { throwIfNoEntry: false })?.size
  if (size === undefined) {
    answer(res, 404, missing(path))
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', size)
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'HEAD') res.end()
  else stream(res, path)
}

function romFiles(dir: string): Middleware {
  return (req, res, next) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (!path.startsWith('/rom/')) {
      next()
      return
    }
    const route = ROUTES.get(path)
    if (route === undefined) {
      answer(res, 404, `${path} is not served: only ${[...ROUTES.keys()].join(' and ')}`)
    } else if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD')
      answer(res, 405, `${path} answers GET and HEAD only`)
    } else {
      sendFile(req, res, join(dir, route.name), route.type)
    }
  }
}

// The middlewares go in before Vite's own, so they see every request first, its 404s included.
export function romServer(dir: string = buildPaths().outDir): Plugin {
  const install = (server: { middlewares: { use: (fn: Middleware) => unknown } }) => {
    server.middlewares.use(isolate)
    server.middlewares.use(romFiles(dir))
  }
  return { name: 'irv-rom-server', configureServer: install, configurePreviewServer: install }
}
