import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { OUTPUT_NAMES } from './rom-outputs.ts'
import {
  addWorktree,
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
    const paths = {
      outDir: '/repo/build/rom',
      tree: '/cache/rom/expansion',
      stampPath: '/cache/rom/applied.json',
    }
    expect(reproPaths(paths)).toEqual({
      outDir: '/repo/build/rom/repro',
      tree: '/cache/rom/repro/expansion',
      stampPath: '/cache/rom/repro/applied.json',
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

describe('the fresh worktree', () => {
  let repo: string
  let commit: string

  beforeEach(() => {
    repo = mkdtempSync(join(scratch, 'repo-'))
    sh(repo, 'init', '-q', '-b', 'master')
    writeFileSync(join(repo, 'main.c'), 'int main(void) { return 0; }\n')
    sh(repo, 'add', '-A')
    sh(repo, 'commit', '-q', '-m', 'one')
    commit = sh(repo, 'rev-parse', 'HEAD').trim()
  })

  const listed = () => sh(repo, 'worktree', 'list', '--porcelain')

  it('checks the commit out detached at another path and removes it again', () => {
    const path = join(scratch, `wt-${String(Date.now())}`, 'expansion')
    addWorktree(repo, path, commit)
    expect(sh(path, 'rev-parse', 'HEAD').trim()).toBe(commit)
    expect(sh(path, 'rev-parse', '--abbrev-ref', 'HEAD').trim()).toBe('HEAD')
    expect(listed()).toContain(path)
    writeFileSync(join(path, 'main.o'), 'built\n')
    removeWorktree(repo, path)
    expect(existsSync(path)).toBe(false)
    expect(listed()).not.toContain(path)
  })

  it('replaces a worktree that an earlier run left behind', () => {
    const path = join(scratch, `stale-${String(Date.now())}`, 'expansion')
    addWorktree(repo, path, commit)
    writeFileSync(join(path, 'main.c'), 'stale\n')
    addWorktree(repo, path, commit)
    expect(sh(path, 'status', '--porcelain')).toBe('')
    removeWorktree(repo, path)
  })

  it('replaces a leftover folder that git no longer knows', () => {
    const path = join(scratch, `left-${String(Date.now())}`, 'expansion')
    mkdirSync(path, { recursive: true })
    writeFileSync(join(path, 'junk'), 'x\n')
    addWorktree(repo, path, commit)
    expect(existsSync(join(path, 'junk'))).toBe(false)
    removeWorktree(repo, path)
  })
})
