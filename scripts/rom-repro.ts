// npm run rom:repro (plan §7): two clean builds of the pinned tree, the second in a fresh git
// worktree at another path, must give the same ROM, patch and slot description. The worktree goes
// again when the run ends, pass or fail; both builds' outputs stay in build/rom/ for a look.
// A heavy check on devbox: about two full builds, alone and in the background (AGENTS.md).
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { buildPaths, buildRom } from './rom-build.ts'
import type { BuildPaths } from './rom-build.ts'
import { loadBuildConfig } from './rom-config.ts'
import type { BuildConfig } from './rom-config.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { GBA_ROM_BASE } from './rom-slot.ts'
import { git } from './rom-upstream.ts'

export interface MapSymbol {
  name: string
  offset: number
  file: string | undefined
}

export interface ReproComparison {
  pass: boolean
  sha1: { a: string; b: string }
  differing: string[]
  firstDifference?: { offset: number; symbol: MapSymbol | undefined }
}

interface MapSection {
  name: string
  start: number
  file: string
}

const COMPARED = [OUTPUT_NAMES.rom, OUTPUT_NAMES.patch, OUTPUT_NAMES.slot]

const sha1 = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')

// The second build's tree, stamp and outputs sit beside the first's, never inside its tree.
export function reproPaths(paths: BuildPaths): BuildPaths {
  const cacheDir = join(dirname(paths.tree), 'repro')
  return {
    outDir: join(paths.outDir, 'repro'),
    tree: join(cacheDir, 'expansion'),
    stampPath: join(cacheDir, 'applied.json'),
  }
}

export function firstDifference(a: Uint8Array, b: Uint8Array): number | undefined {
  const length = Math.min(a.length, b.length)
  for (let offset = 0; offset < length; offset++) {
    if (a[offset] !== b[offset]) return offset
  }
  return a.length === b.length ? undefined : length
}

const SECTION_LINE = /^ (\.\S+)?\s+0x([0-9a-f]+)\s+0x([0-9a-f]+)\s+(\S.*)$/
const SYMBOL_LINE = /^\s+0x([0-9a-f]+)\s+([A-Za-z_$][\w$.]*)$/
const NAME_LINE = /^ (\.\S+)$/

// " .name 0xSTART 0xSIZE file"; a long name stands alone on the line before. Empty ones don't count.
function readSection(line: string, pendingName: string | undefined): MapSection | undefined {
  const match = SECTION_LINE.exec(line)
  if (match === null) return undefined
  const [, ownName, start = '', size = '', file = ''] = match
  const name = ownName ?? pendingName
  if (name === undefined || parseInt(size, 16) === 0) return undefined
  return { name, start: parseInt(start, 16), file }
}

// GNU ld map lines: sections as above and "0xADDRESS name" for a symbol. Assignments such as
// ". = ALIGN (0x4)" match neither.
function readMap(mapText: string): { sections: MapSection[]; symbols: Map<number, string> } {
  const sections: MapSection[] = []
  const symbols = new Map<number, string>()
  let pendingName: string | undefined
  for (const line of mapText.split('\n')) {
    const section = readSection(line, pendingName)
    const [, address = '', symbol] = SYMBOL_LINE.exec(line) ?? []
    if (section !== undefined) sections.push(section)
    else if (symbol !== undefined) symbols.set(parseInt(address, 16), symbol)
    pendingName = NAME_LINE.exec(line)?.[1]
  }
  return { sections, symbols }
}

// The nearest symbol at or below the address inside the section that holds it, else the section.
export function symbolAt(mapText: string, address: number): MapSymbol | undefined {
  const { sections, symbols } = readMap(mapText)
  let section: MapSection | undefined
  for (const next of sections) {
    if (next.start <= address && (section === undefined || next.start > section.start)) {
      section = next
    }
  }
  if (section === undefined) return undefined
  let found = { name: section.name, start: section.start }
  for (const [start, name] of symbols) {
    if (start <= address && start >= found.start) found = { name, start }
  }
  return { name: found.name, offset: address - found.start, file: section.file }
}

export function compareOutputs(dirA: string, dirB: string): ReproComparison {
  const read = (dir: string, name: string) => readFileSync(join(dir, name))
  const differing = COMPARED.filter((name) => !read(dirA, name).equals(read(dirB, name)))
  const romA = read(dirA, OUTPUT_NAMES.rom)
  const romB = read(dirB, OUTPUT_NAMES.rom)
  const result: ReproComparison = {
    pass: differing.length === 0,
    sha1: { a: sha1(romA), b: sha1(romB) },
    differing,
  }
  const offset = firstDifference(romA, romB)
  if (offset !== undefined) {
    const mapText = readFileSync(join(dirA, OUTPUT_NAMES.map), 'utf8')
    result.firstDifference = { offset, symbol: symbolAt(mapText, GBA_ROM_BASE + offset) }
  }
  return result
}

// A worktree holds a .git file; anything else at the path is a leftover folder.
export function removeWorktree(repo: string, path: string): void {
  const dotGit = join(path, '.git')
  if (existsSync(dotGit) && statSync(dotGit).isFile()) {
    git(repo, ['worktree', 'remove', '--force', '--force', path])
  }
  rmSync(path, { recursive: true, force: true })
  git(repo, ['worktree', 'prune'])
}

export function addWorktree(repo: string, path: string, commit: string): void {
  removeWorktree(repo, path)
  mkdirSync(dirname(path), { recursive: true })
  git(repo, ['worktree', 'add', '--quiet', '--detach', path, commit])
}

const say = (line: string) => process.stdout.write(`rom:repro: ${line}\n`)

function describeResult(result: ReproComparison): string {
  if (result.pass) return `pass: both builds give ROM SHA1 ${result.sha1.a}`
  const symbol = result.firstDifference?.symbol
  const offset = result.firstDifference?.offset.toString(16)
  const where = symbol === undefined ? '' : ` (${symbol.name}+0x${symbol.offset.toString(16)})`
  const at = offset === undefined ? '' : `; first ROM difference at 0x${offset}${where}`
  const sha = `ROM SHA1 ${result.sha1.a} and ${result.sha1.b}`
  return `fail: ${sha}; ${result.differing.join(', ')} differ${at}; both builds stay in build/rom`
}

function timedBuild(paths: BuildPaths, config: BuildConfig, seconds: Record<string, number>): void {
  const key = seconds.a === undefined ? 'a' : 'b'
  say(`build ${key} in ${paths.tree}`)
  const start = performance.now()
  buildRom(paths, config, true)
  seconds[key] = Math.round((performance.now() - start) / 1000)
}

function repro(): ReproComparison {
  const config = loadBuildConfig()
  const a = buildPaths(process.env)
  const b = reproPaths(a)
  const seconds: Record<string, number> = {}
  timedBuild(a, config, seconds)
  try {
    addWorktree(a.tree, b.tree, config.upstream.commit)
    timedBuild(b, config, seconds)
  } finally {
    removeWorktree(a.tree, b.tree)
    rmSync(dirname(b.tree), { recursive: true, force: true })
    say(`removed the worktree ${b.tree}`)
  }
  const result = compareOutputs(a.outDir, b.outDir)
  const record = { ...result, trees: { a: a.tree, b: b.tree }, outDirs: [a.outDir, b.outDir] }
  writeFileSync(
    join(a.outDir, 'repro.json'),
    `${JSON.stringify({ ...record, seconds }, null, 2)}\n`,
  )
  return result
}

function main(): void {
  try {
    const result = repro()
    say(describeResult(result))
    if (!result.pass) process.exitCode = 1
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ''
    process.stderr.write(`rom:repro: ${message}\n${cause === '' ? '' : `${cause}\n`}`)
    process.exitCode = 1
  }
}

if (import.meta.main) main()
