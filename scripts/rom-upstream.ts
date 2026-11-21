// The pinned upstream tree and our changes on it (plan §3, ADR 0007): clone the tag, check the
// commit, reset, apply rom/gen3/patches in the order of `series`, copy our own files in. A stamp
// skips the reset and the patches when nothing changed, so make sees no new times on patched files.
// Our files are written only when their content differs from the tree's copy, with the current
// time, so make rebuilds exactly those, even after an edit made while make compiled the old text.
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'

import type { UpstreamPin } from './rom-config.ts'
import { git } from './rom-git.ts'
import { removeInside } from './rom-paths.ts'
import type { RomRoots } from './rom-paths.ts'

export interface TreeOptions {
  tree: string
  romDir: string
  pin: UpstreamPin
  roots: RomRoots
  stampPath: string
  clean?: boolean
}

export interface TreeResult {
  applied: boolean
  patches: string[]
  // Every file of ours in the tree, and the ones this run wrote because their content changed.
  copied: string[]
  written: string[]
}

interface Patch {
  name: string
  path: string
  bytes: Buffer
}

interface Stamp {
  patchSet: string
  diff: string
}

// Our files land in the same folders of the tree, where the Makefile's wildcards find them.
const OUR_DIRS = ['src', 'include', 'test']

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')

export function readSeries(text: string): string[] {
  const names = text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line !== '')
  for (const name of names) {
    if (!/^\w[\w.-]*$/.test(name)) throw new Error(`patches/series: "${name}" is no file name`)
  }
  return names
}

// Runs before anything resets or cleans, so the build never touches another checkout.
function checkPin(tree: string, pin: UpstreamPin): void {
  const top = git(tree, ['rev-parse', '--show-toplevel']).trim()
  if (realpathSync(top) !== realpathSync(tree)) {
    throw new Error(`${tree} is not the top of a git checkout`)
  }
  const head = git(tree, ['rev-parse', 'HEAD']).trim()
  if (head !== pin.commit) {
    throw new Error(
      `${tree}: HEAD ${head} is not the pinned commit ${pin.commit} of tag ${pin.tag}; run npm run rom:clean -- --all`,
    )
  }
}

// A missing tree gets a shallow clone of the tag. The pin check then holds the tag to its commit.
export function ensureCheckout(tree: string, pin: UpstreamPin): void {
  if (!existsSync(tree)) {
    mkdirSync(dirname(tree), { recursive: true })
    const clone = ['clone', '--quiet', '--depth', '1', '--branch', pin.tag, '--single-branch']
    git(dirname(tree), [...clone, '--no-tags', pin.repository, tree])
  }
  checkPin(tree, pin)
}

function loadPatches(romDir: string): { seriesText: string; patches: Patch[] } {
  const seriesText = readFileSync(join(romDir, 'patches', 'series'), 'utf8')
  const patches = readSeries(seriesText).map((name) => {
    const path = join(romDir, 'patches', name)
    if (!existsSync(path)) throw new Error(`patches/series names ${name}, which patches/ lacks`)
    return { name, path, bytes: readFileSync(path) }
  })
  return { seriesText, patches }
}

function patchSetHash(seriesText: string, patches: Patch[]): string {
  const parts = patches.map((patch) => `${patch.name}\0${sha256(patch.bytes)}`)
  return sha256([sha256(seriesText), ...parts].join('\n'))
}

function readStamp(path: string): Stamp | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Stamp
  } catch {
    return undefined
  }
}

const diffHash = (tree: string) => sha256(git(tree, ['diff', '--binary', 'HEAD']))

function applyPatch(tree: string, patch: Patch): void {
  try {
    git(tree, ['apply', patch.path])
  } catch (error) {
    throw new Error(`patch ${patch.name} does not apply`, { cause: error })
  }
  const added = git(tree, ['ls-files', '--others', '--exclude-standard']).split('\n')
  const first = added.find((path) => path !== '')
  if (first !== undefined) {
    throw new Error(
      `patch ${patch.name} adds ${first}; new files belong in rom/gen3/src, include or test`,
    )
  }
}

function ourFiles(romDir: string): string[] {
  return OUR_DIRS.filter((dir) => existsSync(join(romDir, dir)))
    .flatMap((dir) => readdirSync(join(romDir, dir), { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => relative(romDir, join(entry.parentPath, entry.name)))
    .sort()
}

// Upstream files change only through patches, so a copy over a tracked file is an error.
function refuseTracked(tree: string, files: string[]): void {
  if (files.length === 0) return
  const tracked = git(tree, ['ls-files', '-z', '--', ...files])
    .split('\0')
    .filter(Boolean)
  if (tracked.length > 0) {
    const list = tracked.map((path) => `${path} is an upstream file`).join(', ')
    throw new Error(`${list}; change it through a patch in rom/gen3/patches, not a copy`)
  }
}

function readIfFile(path: string): Buffer | undefined {
  return existsSync(path) ? readFileSync(path) : undefined
}

// A fresh write gets the current time; an unchanged copy keeps its own, so make skips it.
function writeChanged(tree: string, romDir: string, files: string[]): string[] {
  return files.filter((file) => {
    const bytes = readFileSync(join(romDir, file))
    const target = join(tree, file)
    if (readIfFile(target)?.equals(bytes) === true) return false
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, bytes)
    return true
  })
}

// Without -x, clean keeps ignored files, and -e adds our current files to them: a stale copy goes,
// a current one stays for the content check. `clean` (-x) drops them all, as a fresh checkout.
function cleanArgs(files: string[], clean: boolean): string[] {
  if (clean) return ['clean', '-fdxq']
  const keep = files.flatMap((file) => ['-e', `/${file.replace(/[\\*?[!#]/g, '\\$&')}`])
  return ['clean', '-fdq', ...keep]
}

// Reset, clean, patches, stamp, copy. Cleaning without -x drops stale copies and keeps the ignored
// build products; `clean` adds -x, which equals a fresh checkout.
export function prepareTree(options: TreeOptions): TreeResult {
  const { tree, romDir, pin, roots, stampPath, clean = false } = options
  checkPin(tree, pin)
  const files = ourFiles(romDir)
  const { seriesText, patches } = loadPatches(romDir)
  const patchSet = patchSetHash(seriesText, patches)
  const stamp = readStamp(stampPath)
  const applied = clean || stamp?.patchSet !== patchSet || stamp.diff !== diffHash(tree)
  if (applied) {
    removeInside(roots, stampPath)
    git(tree, ['reset', '--hard', '-q', pin.commit])
  }
  git(tree, cleanArgs(files, clean))
  if (applied) {
    for (const patch of patches) applyPatch(tree, patch)
    mkdirSync(dirname(stampPath), { recursive: true })
    writeFileSync(stampPath, `${JSON.stringify({ patchSet, diff: diffHash(tree) }, null, 2)}\n`)
  }
  refuseTracked(tree, files)
  const written = writeChanged(tree, romDir, files)
  return { applied, patches: patches.map((patch) => patch.name), copied: files, written }
}

// For rom:clean: drops the build products and our copies, keeps upstream files and the patches.
export function cleanTree(tree: string, pin: UpstreamPin): void {
  checkPin(tree, pin)
  git(tree, ['clean', '-fdxq'])
}
