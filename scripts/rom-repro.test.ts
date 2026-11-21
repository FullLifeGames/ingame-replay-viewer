import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import type { BuildConfig } from './rom-config.ts'
import { OUTPUT_NAMES } from './rom-outputs.ts'
import { buildPaths } from './rom-paths.ts'
import type { BuildPaths } from './rom-paths.ts'
import {
  addWorktree,
  buildTwice,
  compareOutputs,
  firstDifference,
  removeWorktree,
  reproPaths,
  symbolAt,
} from './rom-repro.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-repro-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const sh = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  })

// Lines in the layout GNU ld writes into pokeemerald.map.
const MAP = [
  ' *.o(.text.consts)',
  ' .text.consts   0x08002154       0x10 src/agb_flash_1m.o',
  ' *fill*         0x08002164      0xe9c 00000000',
  ' .text.consts   0x08003000    0x20000 src/replay_slot.o',
  '                0x08003000                gReplaySlot',
  ' .text          0x0802300c     0x16c0 src/AgbRfu_LinkManager.o',
  '                0x08023c14                rfu_LMAN_REQBN_softReset_and_checkID',
  '                0x08023c70                rfu_LMAN_REQ_sendData',
  ' .text.long_section_name',
  '                0x08030000       0x20 src/long.o',
  '                0x08030000                LongName',
  '                0x08030010                . = ALIGN (0x4)',
  '',
].join('\n')

describe('the paths of the second build', () => {
  it('puts the fresh worktree, its stamp and its outputs beside the first build', () => {
    const roots = { cache: '/repo/.cache/rom', out: '/repo/build/rom' }
    const paths = {
      roots,
      outDir: '/repo/build/rom',
      tree: '/repo/.cache/rom/expansion',
      stampPath: '/repo/.cache/rom/applied.json',
    }
    expect(reproPaths(paths)).toEqual({
      roots,
      outDir: '/repo/build/rom/repro',
      tree: '/repo/.cache/rom/repro/expansion',
      stampPath: '/repo/.cache/rom/repro/applied.json',
    })
  })
})

describe('the first differing byte', () => {
  it('is undefined for equal bytes', () => {
    expect(firstDifference(Uint8Array.of(1, 2, 3), Uint8Array.of(1, 2, 3))).toBeUndefined()
  })

  it('is the offset of the first byte that differs', () => {
    expect(firstDifference(Uint8Array.of(1, 2, 3, 4), Uint8Array.of(1, 2, 9, 9))).toBe(2)
  })

  it('is the end of the shorter one when one is a prefix of the other', () => {
    expect(firstDifference(Uint8Array.of(1, 2), Uint8Array.of(1, 2, 3))).toBe(2)
  })
})

describe('the symbol at an address in the map', () => {
  it('names the nearest symbol below, its distance and the object file', () => {
    expect(symbolAt(MAP, 0x08003010)).toEqual({
      name: 'gReplaySlot',
      offset: 0x10,
      file: 'src/replay_slot.o',
    })
    expect(symbolAt(MAP, 0x08023c70)).toEqual({
      name: 'rfu_LMAN_REQ_sendData',
      offset: 0,
      file: 'src/AgbRfu_LinkManager.o',
    })
  })

  it('reads a section whose name sits on a line of its own and skips assignments', () => {
    expect(symbolAt(MAP, 0x08030014)).toEqual({
      name: 'LongName',
      offset: 0x14,
      file: 'src/long.o',
    })
  })

  it('gives the file alone where no symbol of that section lies below', () => {
    expect(symbolAt(MAP, 0x08002158)).toEqual({
      name: '.text.consts',
      offset: 4,
      file: 'src/agb_flash_1m.o',
    })
  })

  it('is undefined below the first section', () => {
    expect(symbolAt(MAP, 0x08000000)).toBeUndefined()
  })
})

function writeBuild(dir: string, rom: Uint8Array, slot = '{"offset":12288}\n'): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, OUTPUT_NAMES.rom), rom)
  writeFileSync(join(dir, OUTPUT_NAMES.patch), Uint8Array.of(0x42, 0x50, 0x53, 0x31))
  writeFileSync(join(dir, OUTPUT_NAMES.slot), slot)
  writeFileSync(join(dir, OUTPUT_NAMES.map), MAP)
}

describe('the comparison of two builds', () => {
  let a: string
  let b: string
  const rom = new Uint8Array(0x40000)

  beforeEach(() => {
    a = mkdtempSync(join(scratch, 'a-'))
    b = mkdtempSync(join(scratch, 'b-'))
    writeBuild(a, rom)
  })

  it('passes when ROM, patch and slot description are byte-equal', () => {
    writeBuild(b, rom)
    const result = compareOutputs(a, b)
    expect(result).toEqual({
      pass: true,
      sha1: { a: result.sha1.a, b: result.sha1.a },
      differing: [],
    })
    expect(result.sha1.a).toMatch(/^[0-9a-f]{40}$/)
  })

  it('fails on a differing ROM byte and names its offset and symbol', () => {
    const other = rom.slice()
    other[0x3010] = 1
    writeBuild(b, other)
    const result = compareOutputs(a, b)
    expect(result.pass).toBe(false)
    expect(result.sha1.a).not.toBe(result.sha1.b)
    expect(result.differing).toEqual([OUTPUT_NAMES.rom])
    expect(result.firstDifference).toEqual({
      offset: 0x3010,
      symbol: { name: 'gReplaySlot', offset: 0x10, file: 'src/replay_slot.o' },
    })
  })

  it('fails on a differing slot description with equal ROMs', () => {
    writeBuild(b, rom, '{"offset":4096}\n')
    expect(compareOutputs(a, b)).toMatchObject({
      pass: false,
      differing: [OUTPUT_NAMES.slot],
    })
  })
})

// A folder laid out like the repo with A's tree at .cache/rom/expansion, one commit in it.
function layout(): { paths: BuildPaths; commit: string } {
  const repo = join(mkdtempSync(join(scratch, 'case-')), 'repo')
  mkdirSync(repo)
  const paths = buildPaths(repo)
  mkdirSync(paths.tree, { recursive: true })
  sh(paths.tree, 'init', '-q', '-b', 'master')
  writeFileSync(join(paths.tree, 'main.c'), 'int main(void) { return 0; }\n')
  sh(paths.tree, 'add', '-A')
  sh(paths.tree, 'commit', '-q', '-m', 'one')
  return { paths, commit: sh(paths.tree, 'rev-parse', 'HEAD').trim() }
}

const listed = (repo: string) => sh(repo, 'worktree', 'list', '--porcelain')

const commitOf = (paths: BuildPaths) => sh(paths.tree, 'rev-parse', 'HEAD').trim()

const configFor = (commit: string): BuildConfig => ({
  upstream: { repository: 'https://example.invalid/expansion', tag: 'v1', commit },
  baseRom: { sha1: '0'.repeat(40) },
  make: { jobs: 1 },
})

describe('the fresh worktree', () => {
  let paths: BuildPaths
  let commit: string
  let path: string

  beforeEach(() => {
    ;({ paths, commit } = layout())
    path = reproPaths(paths).tree
  })

  it('checks the commit out detached at another path and removes it again', () => {
    addWorktree(paths, commit)
    expect(sh(path, 'rev-parse', 'HEAD').trim()).toBe(commit)
    expect(sh(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('HEAD')
    expect(listed(paths.tree)).toContain(path)
    writeFileSync(join(path, 'main.o'), 'built\n')
    removeWorktree(paths)
    expect(existsSync(path)).toBe(false)
    expect(listed(paths.tree)).not.toContain(path)
  })

  it('replaces a worktree that an earlier run left behind', () => {
    addWorktree(paths, commit)
    writeFileSync(join(path, 'main.c'), 'stale\n')
    addWorktree(paths, commit)
    expect(sh(path, 'status', '--porcelain')).toBe('')
    removeWorktree(paths)
  })

  it('replaces a leftover folder inside .cache/rom that git no longer knows', () => {
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'junk'), 'x\n')
    addWorktree(paths, commit)
    expect(existsSync(join(path, 'junk'))).toBe(false)
    removeWorktree(paths)
  })

  it('refuses a worktree path outside .cache/rom and leaves it', () => {
    const outside = join(dirname(dirname(paths.roots.cache)), '..', 'outside')
    mkdirSync(join(outside, 'repro', 'expansion'), { recursive: true })
    writeFileSync(join(outside, 'repro', 'expansion', 'keep.txt'), 'keep\n')
    expect(() => {
      removeWorktree({ ...paths, tree: join(outside, 'expansion') })
    }).toThrow(/may not delete/)
    expect(existsSync(join(outside, 'repro', 'expansion', 'keep.txt'))).toBe(true)
  })
})

describe('the two builds', () => {
  const ROM = 'rom\n'
  const writeOutputs = (paths: BuildPaths) => {
    mkdirSync(paths.outDir, { recursive: true })
    writeFileSync(join(paths.outDir, OUTPUT_NAMES.rom), ROM)
  }

  it('builds A, then B in the fresh worktree, and removes the worktree again', () => {
    const { paths } = layout()
    const trees: string[] = []
    buildTwice(paths, configFor(commitOf(paths)), (built) => {
      trees.push(built.tree)
      writeOutputs(built)
    })
    expect(trees).toEqual([paths.tree, reproPaths(paths).tree])
    expect(readFileSync(join(reproPaths(paths).outDir, OUTPUT_NAMES.rom), 'utf8')).toBe(ROM)
    expect(existsSync(dirname(reproPaths(paths).tree))).toBe(false)
  })

  it('removes the worktree and its folder when build B fails, and keeps A', () => {
    const { paths, commit } = layout()
    const config = configFor(commit)
    expect(() => {
      buildTwice(paths, config, (built) => {
        if (built.tree !== paths.tree) throw new Error('make failed in B')
        writeOutputs(built)
      })
    }).toThrow(/make failed in B/)
    expect(existsSync(dirname(reproPaths(paths).tree))).toBe(false)
    expect(listed(paths.tree)).not.toContain(reproPaths(paths).tree)
    expect(existsSync(join(paths.tree, 'main.c'))).toBe(true)
    expect(existsSync(join(paths.outDir, OUTPUT_NAMES.rom))).toBe(true)
  })
})
