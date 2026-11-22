// Patched copies for the WebAssembly build (#35, plan §2): an upstream file that needs a change is
// copied from the tree into build/wasm/overlay and patched there by rom/gen3/wasm/patches/series.
// The tree stays byte for byte as it is. Each patch is a `git diff` with its reason above the
// first `diff --git`, as rom/gen3/README.md asks.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { withoutGitVariables } from './rom-git.ts'
import { checkRemovable, emptyInside } from './rom-paths.ts'
import type { RomRoots } from './rom-paths.ts'
import { readSeries } from './rom-upstream.ts'

export interface CopySet {
  from: string
  to: string
  // The folder with `series` and the patches it names. The files they change are the copies.
  patches: string
  roots: RomRoots
}

interface Patch {
  name: string
  path: string
  files: string[]
}

const DIFF_LINE = /^diff --git a\/(\S+) b\/(\S+)$/

export function patchedFiles(text: string, name: string): string[] {
  const lines = text.split('\n')
  const files: string[] = []
  lines.forEach((line, at) => {
    const match = DIFF_LINE.exec(line)
    if (match === null) return
    const [, before, after] = match as unknown as [string, string, string]
    if (before !== after || (lines[at + 1] ?? '').startsWith('new file mode')) {
      throw new Error(`${name} adds ${after}; a patch only changes a file`)
    }
    if (after.split('/').includes('..')) throw new Error(`${name} reaches outside: ${after}`)
    files.push(after)
  })
  if (files.length === 0) throw new Error(`${name} changes no file`)
  return files
}

function loadPatches(dir: string): Patch[] {
  return readSeries(readFileSync(join(dir, 'series'), 'utf8')).map((name) => {
    const path = join(dir, name)
    if (!existsSync(path)) throw new Error(`${dir}/series names ${name}, which the folder lacks`)
    return { name, path, files: patchedFiles(readFileSync(path, 'utf8'), name) }
  })
}

// git apply outside any repository: the ceiling keeps it from finding ours above the copies.
function apply(set: CopySet, patch: Patch): void {
  const env = { ...withoutGitVariables(process.env), GIT_CEILING_DIRECTORIES: dirname(set.to) }
  const run = spawnSync('git', ['apply', '--whitespace=nowarn', patch.path], {
    cwd: set.to,
    encoding: 'utf8',
    env,
  })
  if (run.status !== 0) {
    throw new Error(`${patch.name} does not apply to ${set.to}: ${run.stderr.trim()}`)
  }
}

// git apply skips a path it resolves outside its cwd and still exits 0 (review W2), so each file a
// patch names must differ from its source afterwards.
function checkChanged(set: CopySet, patches: readonly Patch[]): void {
  for (const file of new Set(patches.flatMap((patch) => patch.files))) {
    if (!readFileSync(join(set.to, file)).equals(readFileSync(join(set.from, file)))) continue
    const names = patches.filter((patch) => patch.files.includes(file)).map((patch) => patch.name)
    throw new Error(`${names.join(', ')} left ${file} as it was in ${set.to}`)
  }
}

// Returns the copied files, relative to both folders.
export function prepareCopies(set: CopySet): string[] {
  checkRemovable(set.roots, set.to)
  const patches = loadPatches(set.patches)
  const files = [...new Set(patches.flatMap((patch) => patch.files))].sort()
  emptyInside(set.roots, set.to)
  for (const file of files) {
    mkdirSync(dirname(join(set.to, file)), { recursive: true })
    copyFileSync(join(set.from, file), join(set.to, file))
  }
  mkdirSync(set.to, { recursive: true })
  for (const patch of patches) apply(set, patch)
  checkChanged(set, patches)
  return files
}
