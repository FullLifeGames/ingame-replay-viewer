// Nothing from a ROM in the tracked tree (ADR 0002): no ROM, savestate, ELF or patch by its name,
// no file that starts with a GBA cartridge header, and the build folders stay ignored.
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: here,
  encoding: 'utf8',
}).trim()
// From the top, so ls-files lists the whole tree and check-ignore reads paths from the root.
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
const tracked = git('ls-files', '-z').split('\0').filter(Boolean)

const FORBIDDEN_NAME = /\.(?:gba|agb|bps|ips|ups|sav|srm|elf|nds|ss\w*|state)$/i

// The GBA header: the fixed value 0x96 at 0xB2 and the complement over 0xA0 to 0xBC at 0xBD. The
// check needs none of the Nintendo logo bytes, so this spec holds nothing taken from a ROM.
const HEADER_END = 0xbe

function hasGbaHeader(bytes: Uint8Array): boolean {
  if (bytes.length < HEADER_END || bytes[0xb2] !== 0x96) return false
  const sum = bytes.subarray(0xa0, 0xbd).reduce((total, byte) => total + byte, 0)
  return ((-sum - 0x19) & 0xff) === bytes[0xbd]
}

function headOf(path: string): Uint8Array {
  const bytes = new Uint8Array(HEADER_END)
  const fd = openSync(path, 'r')
  try {
    return bytes.subarray(0, readSync(fd, bytes, 0, HEADER_END, 0))
  } finally {
    closeSync(fd)
  }
}

function syntheticHeader(): Uint8Array {
  const bytes = new Uint8Array(0xc0)
  bytes.set(new TextEncoder().encode('IRV TEST    '), 0xa0)
  bytes[0xb2] = 0x96
  const sum = bytes.subarray(0xa0, 0xbd).reduce((total, byte) => total + byte, 0)
  bytes[0xbd] = (-sum - 0x19) & 0xff
  return bytes
}

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

describe('the tracked tree', () => {
  it('holds no ROM, savestate, ELF or patch by name', () => {
    expect(tracked.filter((path) => FORBIDDEN_NAME.test(path))).toEqual([])
  })

  it('holds no file that starts with a GBA header', () => {
    const files = tracked
      .map((path) => join(root, path))
      .filter((path) => existsSync(path) && statSync(path).isFile())
    expect(files.length).toBeGreaterThan(0)
    expect(files.filter((path) => hasGbaHeader(headOf(path)))).toEqual([])
  })

  it.each([
    '.cache/rom/expansion/Makefile',
    'build/rom/irv-emerald.gba',
    'build/rom/irv-emerald.bps',
    'build/rom/replay-slot.json',
  ])('ignores %s', (path) => {
    expect(git('check-ignore', path).trim()).toBe(path)
  })
})
