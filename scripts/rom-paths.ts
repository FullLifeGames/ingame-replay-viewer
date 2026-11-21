// Where the ROM build lives (plan §14): the pinned tree and its stamp under <repo>/.cache/rom, the
// outputs under <repo>/build/rom. The guard here is the one place that decides whether the build
// may delete a path; every recursive delete and worktree removal in scripts/rom-* goes through it.
import { lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

export interface RomRoots {
  cache: string
  out: string
}

export interface BuildPaths {
  roots: RomRoots
  outDir: string
  tree: string
  stampPath: string
}

// The repo's real path, so a checkout reached through a link still finds its own folders.
export function romRoots(repoDir: string): RomRoots {
  const repo = realpathSync(repoDir)
  return { cache: join(repo, '.cache', 'rom'), out: join(repo, 'build', 'rom') }
}

export function buildPaths(repoDir: string = REPO_DIR): BuildPaths {
  const roots = romRoots(repoDir)
  return {
    roots,
    outDir: roots.out,
    tree: join(roots.cache, 'expansion'),
    stampPath: join(roots.cache, 'applied.json'),
  }
}

function strictlyInside(root: string, path: string): boolean {
  const rel = relative(root, path)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

const exists = (path: string) => lstatSync(path, { throwIfNoEntry: false }) !== undefined

// The real path of a missing file is that of its nearest existing folder plus the rest. A link that
// leads nowhere has none.
function realPath(path: string): string | undefined {
  let head = path
  const rest: string[] = []
  while (!exists(head)) {
    rest.unshift(basename(head))
    head = dirname(head)
  }
  try {
    return join(realpathSync(head), ...rest)
  } catch {
    return undefined
  }
}

// The path, as written and with every link resolved, lies strictly inside a root; the roots
// themselves stay.
function removable(roots: RomRoots, path: string): boolean {
  const inside = (candidate: string | undefined) =>
    candidate !== undefined &&
    (strictlyInside(roots.cache, candidate) || strictlyInside(roots.out, candidate))
  return isAbsolute(path) && inside(resolve(path)) && inside(realPath(path))
}

export function checkRemovable(roots: RomRoots, path: string): void {
  if (!removable(roots, path)) {
    throw new Error(`may not delete "${path}": only paths inside ${roots.cache} or ${roots.out}`)
  }
}

export function removeInside(roots: RomRoots, path: string): void {
  checkRemovable(roots, path)
  rmSync(path, { recursive: true, force: true })
}

// Removes what the folder holds and keeps the folder, so a root can be emptied too.
export function emptyInside(roots: RomRoots, dir: string): void {
  if (!exists(dir)) return
  const real = realpathSync(dir)
  if (real !== roots.cache && real !== roots.out) checkRemovable(roots, dir)
  for (const name of readdirSync(dir)) removeInside(roots, join(dir, name))
}
