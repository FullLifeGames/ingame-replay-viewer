// What both Gen 5 spike servers (#72) answer with: the cross-origin isolation headers, the file
// types, and the rule that maps a request path to a file inside one folder and never outside it.
// Saves (#78) answer from the saves folder alone, by a name src/gen5/save-file.ts allows, the
// fetched site (#79) only the files scripts/gen5-manifest.ts lists as served, /source/ only
// the archives it names (scripts/gen5-sources.ts places them), and /gen5-build/ the two files of
// build/gen5/ that the page reads (src/gen5/build-files.ts, #111).
// scripts/gen5-serve.ts (Vite, for the shot script) and scripts/gen5-built.ts (the built page,
// for the user's own check) import it.
import { createReadStream, statSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { extname, isAbsolute, join, normalize } from 'node:path'

import { BUILD_FILES, BUILD_PREFIX } from '../src/gen5/build-files.ts'
import { isSaveName, SAVES_PREFIX } from '../src/gen5/save-file.ts'
import { archiveName, isServedSitePath, isSourceArchive, type Source } from './gen5-manifest.ts'

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
  '.gz': 'application/gzip',
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

/** `inside` normalized, or undefined when it would climb out of its folder. */
function normalizedInside(inside: string): string | undefined {
  const relative = normalize(inside)
  return relative.startsWith('..') || isAbsolute(relative) ? undefined : relative
}

/** `inside` as a file in `root`, or undefined when it would climb out; '' is index.html. */
function inFolder(root: string, inside: string): string | undefined {
  const relative = normalizedInside(inside === '' ? 'index.html' : inside)
  return relative === undefined ? undefined : join(root, relative)
}

/** The path inside the site for a request path under SITE_PREFIX, normalized; undefined for any
 * other path and one that climbs out. */
export function sitePathOf(url: string): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(SITE_PREFIX) !== true) return undefined
  const inside = path.slice(SITE_PREFIX.length)
  return inside === '' ? '' : normalizedInside(inside)
}

/** The fetched site's file for a path the manifest serves (scripts/gen5-manifest.ts); undefined
 * for any other path. */
export function siteFileFor(url: string, site: string): string | undefined {
  const inside = sitePathOf(url)
  return inside !== undefined && isServedSitePath(inside) ? join(site, inside) : undefined
}

/** The save file in `saves` for `/saves/<name>.sav`; undefined for any other path. */
export function savesFileFor(url: string, saves: string): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(SAVES_PREFIX) !== true) return undefined
  const file = path.slice(SAVES_PREFIX.length)
  if (!file.endsWith('.sav') || !isSaveName(file.slice(0, -'.sav'.length))) return undefined
  return join(saves, file)
}

/** Where the source archives answer on both servers (scripts/gen5-sources.ts). */
export const SOURCE_PREFIX = '/source/'

/** Where `source`'s archive answers on both servers. */
export const archiveHref = (source: Source) => `${SOURCE_PREFIX}${archiveName(source)}`

/** The licences page's file name: the build writes it beside the page, and both servers answer
 * it at the root (D13). */
export const LICENCES_PAGE = 'licences.html'

/** The archive in `sources` for `/source/<archive>` with a name the manifest gives one of its
 * sources; undefined for any other path. */
export function sourceFileFor(url: string, sources: string): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(SOURCE_PREFIX) !== true) return undefined
  const name = path.slice(SOURCE_PREFIX.length)
  return isSourceArchive(name) ? join(sources, name) : undefined
}

/** The two build files the page reads (src/gen5/build-files.ts), made on the build machine. */
export interface BuildFolders {
  bw2Json: string
  routineJson: string
}

/** The numbers' file for `/gen5-build/bw2.json`, the routine's for `/gen5-build/routine.json`;
 * undefined for any other path. */
export function buildFileFor(url: string, folders: BuildFolders): string | undefined {
  const path = decodedPath(url)
  if (path?.startsWith(BUILD_PREFIX) !== true) return undefined
  const name = path.slice(BUILD_PREFIX.length)
  if (name === BUILD_FILES.numbers) return folders.bw2Json
  return name === BUILD_FILES.routine ? folders.routineJson : undefined
}

/** The folders the built server answers from. */
export interface ServedFolders extends BuildFolders {
  built: string
  site: string
  saves: string
  sources: string
}

/** The built page's file for a request: SITE_PREFIX from the fetched site, SAVES_PREFIX from the
 * saves, SOURCE_PREFIX from the source archives, BUILD_PREFIX from the build files, the rest from
 * the built page. */
export function fileFor(url: string, folders: ServedFolders): string | undefined {
  const path = decodedPath(url)
  if (path === undefined) return undefined
  if (path.startsWith(SITE_PREFIX)) return siteFileFor(url, folders.site)
  if (path.startsWith(SAVES_PREFIX)) return savesFileFor(url, folders.saves)
  if (path.startsWith(SOURCE_PREFIX)) return sourceFileFor(url, folders.sources)
  if (path.startsWith(BUILD_PREFIX)) return buildFileFor(url, folders)
  return inFolder(folders.built, path.replace(/^\/+/, ''))
}

/** Sends `file` when it exists, uncached and isolated, with its size; a 404 that names the path
 * otherwise. */
export function sendFile(res: ServerResponse, file: string | undefined, path: string): void {
  const stat = file === undefined ? undefined : statSync(file, { throwIfNoEntry: false })
  if (file === undefined || stat?.isFile() !== true) {
    res.writeHead(404, { ...ISOLATION, 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.end(`gen5: no ${path}`)
    return
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream'
  res.writeHead(200, {
    ...ISOLATION,
    'Content-Type': type,
    'Content-Length': String(stat.size),
    'Cache-Control': 'no-store',
  })
  createReadStream(file).pipe(res)
}
