// Nothing from a ROM in the tracked tree (ADR 0002): no ROM, savestate, ELF, patch, screenshot
// frame or WebAssembly module by its name, no file that starts with a GBA cartridge header, a BPS,
// IPS or UPS magic, the magic of a PPM frame (what rom:shots writes), the wasm magic or the heading
// of the converter's data assembly (the module and wasm:convert carry the game's data), and the
// build folders stay ignored. The contents come from the index, which is what a commit takes, not
// from the files on disk.
//
// One exception to the name rule: a save directly in src/web/gen5/saves/. ADR 0002 ends with "A
// save file holds only player data and may be shipped", and #78 ships the saves we made from New
// Game there. A save anywhere else stays refused, and so does every other forbidden name.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it } from 'vitest'

import { GEN5_PATHS } from './gen5-paths.ts'
import { CONVERTED_BY } from './wasm-data-asm.ts'

const here = dirname(fileURLToPath(import.meta.url))
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: here,
  encoding: 'utf8',
}).trim()
// From the top, so ls-files lists the whole tree and check-ignore reads paths from the root.
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const tracked = git('ls-files', '-z').split('\0').filter(Boolean)

const FORBIDDEN_NAME =
  /\.(?:gba|agb|bps|ips|ups|sav|srm|elf|nds|ss\w*|state|ppm|wasm|data|7z|tgz|tar|gz)$/i

// The saves folder from the root, as git lists it: a save directly in it is ours.
const SAVES = relative(GEN5_PATHS.repo, GEN5_PATHS.saves)
const isOurSave = (path: string) => dirname(path) === SAVES && path.endsWith('.sav')

const isForbiddenName = (path: string) => FORBIDDEN_NAME.test(path) && !isOurSave(path)

// The GBA header: the fixed value 0x96 at 0xB2 and the complement over 0xA0 to 0xBC at 0xBD. The
// check needs none of the Nintendo logo bytes, so this spec holds nothing taken from a ROM.
const HEADER_END = 0xbe

const PATCH_MAGICS = ['BPS1', 'PATCH', 'UPS1'].map((magic) => new TextEncoder().encode(magic))

function hasGbaHeader(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_END || bytes[0xb2] !== 0x96) return false
  const sum = bytes.subarray(0xa0, 0xbd).reduce((total, byte) => total + byte, 0)
  return ((-sum - 0x19) & 0xff) === bytes[0xbd]
}

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]
const ARCHIVE_MAGICS = [
  [0x1f, 0x8b], // gzip: a .tgz, a .tar.gz
  [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], // 7z: an EmulatorJS core (.data)
]

function hasArchiveMagic(bytes: Uint8Array): boolean {
  return ARCHIVE_MAGICS.some((magic) => magic.every((byte, index) => bytes[index] === byte))
}

function hasWasmMagic(bytes: Uint8Array): boolean {
  return WASM_MAGIC.every((byte, index) => bytes[index] === byte)
}

// wasm:convert writes "# data/x.o, converted by ..." as the first line of each data assembly.
function isConvertedData(bytes: Uint8Array): boolean {
  const first = new TextDecoder().decode(bytes).split('\n', 1)[0] ?? ''
  return first.startsWith('# ') && first.endsWith(`, ${CONVERTED_BY}`)
}

function hasPatchMagic(bytes: Uint8Array): boolean {
  return PATCH_MAGICS.some((magic) => magic.every((byte, index) => bytes[index] === byte))
}

// A binary PPM frame starts with "P6" and one whitespace byte (the header rom-shot-probes.ts reads).
const isPpmSpace = (byte: number | undefined) =>
  byte === 0x20 || (byte !== undefined && byte >= 0x09 && byte <= 0x0d)

function hasFrameMagic(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x36 && isPpmSpace(bytes[2])
}

interface Staged {
  path: string
  head: Uint8Array
}

// Every regular file in the index with its first bytes, read through one `git cat-file --batch`.
function stagedHeads(repo: string): Staged[] {
  const entries = execFileSync('git', ['ls-files', '-s', '-z'], { cwd: repo, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((line) => /^(\d+) ([0-9a-f]+) \d\t(.*)$/s.exec(line))
    .filter((match) => match?.[1] === '100644' || match?.[1] === '100755')
    .map((match) => ({ id: match?.[2] ?? '', path: match?.[3] ?? '' }))
  const input = entries.map((entry) => `${entry.id}\n`).join('')
  const out = execFileSync('git', ['cat-file', '--batch'], { cwd: repo, input, maxBuffer: 2 ** 30 })
  let at = 0
  return entries.map(({ path }) => {
    const newline = out.indexOf(0x0a, at)
    const size = Number(/ (\d+)$/.exec(out.subarray(at, newline).toString())?.[1])
    const start = newline + 1
    at = start + size + 1
    return { path, head: out.subarray(start, start + Math.min(size, HEADER_END)) }
  })
}

const offending = (heads: readonly Staged[]) =>
  heads
    .filter(({ head }) =>
      [
        hasGbaHeader,
        hasPatchMagic,
        hasFrameMagic,
        hasWasmMagic,
        hasArchiveMagic,
        isConvertedData,
      ].some((check) => check(head)),
    )
    .map(({ path }) => path)

function syntheticHeader(): Uint8Array {
  const bytes = new Uint8Array(0xc0)
  bytes.set(new TextEncoder().encode('IRV TEST    '), 0xa0)
  bytes[0xb2] = 0x96
  const sum = bytes.subarray(0xa0, 0xbd).reduce((total, byte) => total + byte, 0)
  bytes[0xbd] = (-sum - 0x19) & 0xff
  return bytes
}

const scratch = mkdtempSync(join(tmpdir(), 'irv-tree-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('the GBA header check', () => {
  it('finds a synthetic header', () => {
    expect(hasGbaHeader(syntheticHeader())).toBe(true)
  })

  it('needs the complement to match', () => {
    const bytes = syntheticHeader()
    bytes[0xbd] = ((bytes[0xbd] as number) + 1) & 0xff
    expect(hasGbaHeader(bytes)).toBe(false)
  })
})

describe('the check of a repo index', () => {
  const repo = mkdtempSync(join(scratch, 'repo-'))
  execFileSync('git', ['init', '-q'], { cwd: repo })
  writeFileSync(join(repo, 'notes.md'), '# notes\n')
  writeFileSync(join(repo, 'renamed.txt'), syntheticHeader())
  for (const [name, magic] of [
    ['a.dat', 'BPS1'],
    ['b.dat', 'PATCH'],
    ['c.dat', 'UPS1'],
  ] as const) {
    writeFileSync(join(repo, name), `${magic}\u0000\u0001`)
  }
  writeFileSync(join(repo, 'frame.dat'), 'P6\n240 160\n255\n\u0000\u0001')
  writeFileSync(join(repo, 'module.dat'), '\u0000asm\u0001\u0000\u0000\u0000')
  writeFileSync(join(repo, 'songs.txt'), `# sound/x.o, ${CONVERTED_BY}\n\t.byte\t1\n`)
  writeFileSync(join(repo, 'about.md'), `# Notes on the files ${CONVERTED_BY} writes\n`)
  writeFileSync(join(repo, 'source.txt'), new Uint8Array([0x1f, 0x8b, 0x08, 0x00]))
  writeFileSync(join(repo, 'core.txt'), new Uint8Array([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0x00]))
  execFileSync('git', ['add', '-A'], { cwd: repo })
  unlinkSync(join(repo, 'renamed.txt'))

  it('finds a ROM header, the magics and the data assembly under any name, also when the file left the disk', () => {
    expect(offending(stagedHeads(repo))).toEqual([
      'a.dat',
      'b.dat',
      'c.dat',
      'core.txt',
      'frame.dat',
      'module.dat',
      'renamed.txt',
      'songs.txt',
      'source.txt',
    ])
  })
})

describe('the name rule', () => {
  it.each([
    'emerald.gba',
    'irv-emerald.bps',
    'save.sav',
    'first-hp.ppm',
    'shots/WIN.PPM',
    'build/wasm/irv-emerald.wasm',
  ])('refuses %s', (path) => {
    expect(isForbiddenName(path)).toBe(true)
  })

  // Scene: an archive or a core in the tree (#79, D12): the cores EmulatorJS packs as 7z, the
  // fetched packages and the source archives of scripts/gen5-sources.ts.
  it.each([
    '.cache/gen5/emulatorjs/site/data/cores/melonds-wasm.data',
    'melonds.7z',
    'core-melonds-4.2.3.tgz',
    'retroarch.tar',
    'melonds-18a057d372783b42d7e297b8731f3c3d673cdcab.tar.gz',
    'notes.md.gz',
  ])('refuses the archive or core %s', (path) => {
    expect(isForbiddenName(path)).toBe(true)
  })

  it.each([
    'notes.md',
    'ppm.ts',
    'rom-shot-probes.ts',
    'wasm-run.ts',
    'scripts/gen5-sources.ts',
    'data.json',
  ])('takes %s', (path) => {
    expect(isForbiddenName(path)).toBe(false)
  })

  it('takes a save of ours in the saves folder', () => {
    expect(isForbiddenName('src/web/gen5/saves/route-20.sav')).toBe(false)
  })

  it.each([
    'save.sav',
    'src/web/gen5/route-20.sav',
    'src/web/gen5/saves/deep/x.sav',
    'build/gen5/saves/town.sav',
    'src/web/gen5/saves/x.state',
    'src/web/gen5/saves/x.srm',
  ])('refuses %s outside the exception', (path) => {
    expect(isForbiddenName(path)).toBe(true)
  })
})

// The scan reads every blob of the index. It took 8.9 s in a full check while a second heavy run
// loaded the machine (#92), when it still read the index twice; the limit is twice that or more.
const HEADER_SCAN_LIMIT = 20_000

describe('the tracked tree', () => {
  it('holds no ROM, savestate, ELF, patch, frame, archive or core by name', () => {
    expect(tracked.filter((path) => isForbiddenName(path))).toEqual([])
  })

  it(
    'holds no file that starts with a GBA header, a patch, frame, wasm, gzip or 7z magic, or data assembly',
    () => {
      const heads = stagedHeads(root)
      expect(heads.length).toBeGreaterThan(0)
      expect(offending(heads)).toEqual([])
    },
    HEADER_SCAN_LIMIT,
  )

  it.each([
    '.cache/rom/expansion/Makefile',
    'build/rom/irv-emerald.gba',
    'build/rom/irv-emerald.bps',
    'build/rom/replay-slot.json',
    'build/rom/shots/994052/first-hp.ppm',
    'build/rom/shots/994052.gba',
    'build/rom/check.log',
    'build/wasm/irv-emerald.wasm',
    'build/wasm/irv-emerald-wasm.bps',
    'build/gen5/saves/town.sav',
    'save.sav',
    'src/web/gen5/route-20.sav',
    'src/web/gen5/saves/deep/x.sav',
    'build/wasm/asm/data/battle_scripts_1.s',
    'build/wasm/asm/data/battle_scripts_1.o',
    '.cache/wasm/platform/src/platform/bios.c',
    '.cache/gen5/sources/melonds-18a057d372783b42d7e297b8731f3c3d673cdcab.tar.gz',
    '.cache/gen5/sources/git/melonds.git/HEAD',
    '.cache/gen5/emulatorjs/site/data/cores/melonds-wasm.data',
  ])('ignores %s', (path) => {
    expect(git('check-ignore', path).trim()).toBe(path)
  })
})
