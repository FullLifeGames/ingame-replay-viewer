// What both Gen 5 spike servers (#72) answer with: the cross-origin isolation headers, the file
// types, and the rule that maps a request path to a file inside one folder and never outside it.
// Saves (#78) answer from the saves folder alone, by a name src/gen5/save-file.ts allows.
// scripts/gen5-serve.ts (Vite, for the shot script) and scripts/gen5-built.ts (the built page,
// for the user's own check) import it.
import { createReadStream, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, isAbsolute, join, normalize } from 'node:path'

import { isSaveName, SAVES_PREFIX } from '../src/gen5/save-file.ts'

/** Where the fetched EmulatorJS site answers on both servers. */
export const SITE_PREFIX = '/emulatorjs/'

export const ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

const TYPES: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.html': 'text/html',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
}

/** The request path without its query, decoded; undefined for a malformed escape or a NUL. */
function decodedPath(url: string): string | undefined {
  try {
    const path = decodeURIComponent(url.split('?')[0] ?? '')
    return path.includes('\0') ? undefined : path
  } catch {
    return undefined
  }
}

/** `inside` as a file in `root`, or undefined when it would climb out; '' is index.html. */
function inFolder(root: string, inside: string): string | undefined {
  const relative = normalize(inside === '' ? 'index.html' : inside)
  if (relative.startsWith('..') || isAbsolute(relative)) return undefined
  return join(root, relative)
}

/** The fetched site's file for a path under SITE_PREFIX; undefined for any other path. */
export function siteFileFor(url: string, site: string): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(SITE_PREFIX) !== true) return undefined
  return inFolder(site, path.slice(SITE_PREFIX.length))
}

/** The save file in `saves` for `/saves/<name>.sav`; undefined for any other path. */
export function savesFileFor(url: string, saves: string): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(SAVES_PREFIX) !== true) return undefined
  const file = path.slice(SAVES_PREFIX.length)
  if (!file.endsWith('.sav') || !isSaveName(file.slice(0, -'.sav'.length))) return undefined
  return join(saves, file)
}

/** The built page's file for a request: SITE_PREFIX from the fetched site, SAVES_PREFIX from
 * `saves`, the rest from `page`. */
export function fileFor(
  url: string,
  page: string,
  site: string,
  saves: string,
): string | undefined {
  const path = decodedPath(url)
  if (path === undefined) return undefined
  if (path.startsWith(SITE_PREFIX)) return siteFileFor(url, site)
  if (path.startsWith(SAVES_PREFIX)) return savesFileFor(url, saves)
  return inFolder(page, path.replace(/^\/+/, ''))
}

/** Sends `file` when it exists, uncached and isolated; a 404 that names the path otherwise. */
export function sendFile(res: ServerResponse, file: string | undefined, path: string): void {
  if (file === undefined || statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
    res.writeHead(404, { ...ISOLATION, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.end(`gen5: no ${path}`)
    return
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  res.writeHead(200, { ...ISOLATION, 'Content-Type': type, 'Cache-Control': 'no-store' })
  createReadStream(file).pipe(res)
}
