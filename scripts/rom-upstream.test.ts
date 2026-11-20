import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { ROM_DIR } from './rom-config.ts'
import type { UpstreamPin } from './rom-config.ts'
import { ensureCheckout, prepareTree, readSeries } from './rom-upstream.ts'
import type { TreeOptions } from './rom-upstream.ts'

const scratch = mkdtempSync(join(tmpdir(), 'irv-upstream-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

const sh = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    encoding: 'utf8',
  })

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const MAIN_C = 'int main(void)\n{\n    return 0;\n}\n'

let upstream: string
let rom: string
let pin: UpstreamPin

// A fresh upstream repo with one commit and tag, and a fresh rom/gen3 folder, for each case.
beforeEach(() => {
  upstream = mkdtempSync(join(scratch, 'upstream-'))
  sh(upstream, 'init', '-q', '-b', 'master')
  write(join(upstream, '.gitignore'), '*.o\n')
  write(join(upstream, 'src/main.c'), MAIN_C)
  write(join(upstream, 'include/main.h'), '#define MAIN 1\n')
  sh(upstream, 'add', '-A')
  sh(upstream, 'commit', '-q', '-m', 'upstream')
  sh(upstream, 'tag', 'v1')
  pin = {
    repository: `file://${upstream}`,
    tag: 'v1',
    commit: sh(upstream, 'rev-parse', 'HEAD').trim(),
  }
  rom = mkdtempSync(join(scratch, 'rom-'))
  write(join(rom, 'patches/series'), '# our changes, in order\n')
})

// Two patches on src/main.c, the second on top of the first, made the way the README says.
function writeTwoPatches(): void {
  write(join(upstream, 'src/main.c'), MAIN_C.replace('return 0', 'return 1'))
  write(join(rom, 'patches/0001-one.patch'), `Return 1.\n\n${sh(upstream, 'diff')}`)
  sh(upstream, 'add', '-A')
  write(join(upstream, 'src/main.c'), MAIN_C.replace('return 0', 'return 2'))
  write(join(rom, 'patches/0002-two.patch'), `Return 2.\n\n${sh(upstream, 'diff')}`)
  sh(upstream, 'reset', '-q', '--hard')
  write(join(rom, 'patches/series'), '# in order\n0001-one.patch\n\n0002-two.patch\n')
}

const options = (changes: Partial<TreeOptions> = {}): TreeOptions => ({
  tree: upstream,
  romDir: rom,
  pin,
  stampPath: join(scratch, `${String(Date.now())}-${String(Math.random())}.json`),
  ...changes,
})

const read = (path: string) => readFileSync(join(upstream, path), 'utf8')
const PAST = new Date('2000-01-01T00:00:00Z')

describe('readSeries', () => {
  it('lists the patch names in order without comments and blank lines', () => {
    expect(readSeries('# head\n0001-a.patch\n\n  0002-b.patch  # why\n')).toEqual([
      '0001-a.patch',
      '0002-b.patch',
    ])
  })

  it('refuses a name with a path', () => {
    expect(() => readSeries('../x.patch\n')).toThrow(/"..\/x.patch" is no file name/)
  })
})

describe('ensureCheckout', () => {
  it('clones the tag when the tree is missing', () => {
    const tree = join(scratch, `clone-${String(Date.now())}`)
    ensureCheckout(tree, pin)
    expect(readFileSync(join(tree, 'src/main.c'), 'utf8')).toBe(MAIN_C)
  })

  it('accepts a tree at the pinned commit', () => {
    expect(() => {
      ensureCheckout(upstream, pin)
    }).not.toThrow()
  })

  it('refuses a HEAD other than the pin', () => {
    const other = { ...pin, commit: 'f'.repeat(40) }
    expect(() => {
      ensureCheckout(upstream, other)
    }).toThrow(
      /HEAD [0-9a-f]{40} is not the pinned commit f{40} of tag v1; run npm run rom:clean -- --all/,
    )
  })
})

describe('prepareTree', () => {
  it('refuses a tree inside another checkout before it resets anything', () => {
    write(join(upstream, 'src/main.c'), '// edited\n')
    expect(() => prepareTree(options({ tree: join(upstream, 'src') }))).toThrow(
      /src is not the top of a git checkout/,
    )
    expect(read('src/main.c')).toBe('// edited\n')
  })

  it('applies a two-patch series in order and copies our files', () => {
    writeTwoPatches()
    write(join(rom, 'src/replay_slot.c'), '// ours\n')
    write(join(rom, 'include/replay_slot.h'), '// ours\n')
    const result = prepareTree(options())
    expect(read('src/main.c')).toBe(MAIN_C.replace('return 0', 'return 2'))
    expect(read('src/replay_slot.c')).toBe('// ours\n')
    expect(read('include/replay_slot.h')).toBe('// ours\n')
    expect(result).toEqual({
      applied: true,
      patches: ['0001-one.patch', '0002-two.patch'],
      copied: ['include/replay_slot.h', 'src/replay_slot.c'],
    })
  })

  it('keeps the modification time of our files', () => {
    write(join(rom, 'src/replay_slot.c'), '// ours\n')
    utimesSync(join(rom, 'src/replay_slot.c'), PAST, PAST)
    prepareTree(options())
    expect(statSync(join(upstream, 'src/replay_slot.c')).mtime).toEqual(PAST)
  })

  it('refuses to copy over a tracked file and names it', () => {
    write(join(rom, 'src/main.c'), '// ours\n')
    expect(() => prepareTree(options())).toThrow(
      /src\/main\.c is an upstream file; change it through a patch/,
    )
    expect(read('src/main.c')).toBe(MAIN_C)
  })

  it('names the patch that fails', () => {
    writeTwoPatches()
    write(join(rom, 'patches/series'), '0002-two.patch\n')
    expect(() => prepareTree(options())).toThrow(/patch 0002-two\.patch does not apply/)
  })

  it('names a patch that the series lists and the folder lacks', () => {
    write(join(rom, 'patches/series'), '0009-none.patch\n')
    expect(() => prepareTree(options())).toThrow(
      /series names 0009-none\.patch, which patches\/ lacks/,
    )
  })

  it('refuses a patch that adds a file', () => {
    write(join(upstream, 'src/new.c'), '// new\n')
    sh(upstream, 'add', '-N', 'src/new.c')
    write(join(rom, 'patches/0001-new.patch'), sh(upstream, 'diff'))
    sh(upstream, 'reset', '-q')
    rmSync(join(upstream, 'src/new.c'))
    write(join(rom, 'patches/series'), '0001-new.patch\n')
    expect(() => prepareTree(options())).toThrow(
      /patch 0001-new\.patch adds src\/new\.c; new files belong in rom\/gen3\/src, include or test/,
    )
  })

  it('removes a stale copy on the next run but keeps the build products', () => {
    write(join(rom, 'src/replay_old.c'), '// old\n')
    const stampPath = join(scratch, 'stale.json')
    prepareTree(options({ stampPath }))
    write(join(upstream, 'src/a.o'), 'object')
    rmSync(join(rom, 'src/replay_old.c'))
    expect(prepareTree(options({ stampPath })).copied).toEqual([])
    expect(existsSync(join(upstream, 'src/replay_old.c'))).toBe(false)
    expect(read('src/a.o')).toBe('object')
  })

  it('skips the reset and the patches when the stamp matches', () => {
    writeTwoPatches()
    const stampPath = join(scratch, 'skip.json')
    expect(prepareTree(options({ stampPath })).applied).toBe(true)
    utimesSync(join(upstream, 'src/main.c'), PAST, PAST)
    expect(prepareTree(options({ stampPath })).applied).toBe(false)
    expect(statSync(join(upstream, 'src/main.c')).mtime).toEqual(PAST)
  })

  it('resets a hand edit in the tree and applies again', () => {
    writeTwoPatches()
    const stampPath = join(scratch, 'edit.json')
    prepareTree(options({ stampPath }))
    write(join(upstream, 'include/main.h'), '#define MAIN 2\n')
    expect(prepareTree(options({ stampPath })).applied).toBe(true)
    expect(read('include/main.h')).toBe('#define MAIN 1\n')
    expect(read('src/main.c')).toBe(MAIN_C.replace('return 0', 'return 2'))
  })

  it('applies again when a patch changes', () => {
    writeTwoPatches()
    const stampPath = join(scratch, 'change.json')
    prepareTree(options({ stampPath }))
    write(join(rom, 'patches/series'), '0001-one.patch\n')
    expect(prepareTree(options({ stampPath })).applied).toBe(true)
    expect(read('src/main.c')).toBe(MAIN_C.replace('return 0', 'return 1'))
  })

  it('removes the build products too with clean', () => {
    const stampPath = join(scratch, 'clean.json')
    prepareTree(options({ stampPath }))
    write(join(upstream, 'src/a.o'), 'object')
    expect(prepareTree(options({ stampPath, clean: true })).applied).toBe(true)
    expect(existsSync(join(upstream, 'src/a.o'))).toBe(false)
  })
})

describe('rom/gen3/patches/series', () => {
  it('lists only patches that exist', () => {
    const names = readSeries(readFileSync(join(ROM_DIR, 'patches', 'series'), 'utf8'))
    for (const name of names) expect(existsSync(join(ROM_DIR, 'patches', name))).toBe(true)
  })
})
