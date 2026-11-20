import { createHash } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { APT_INSTALL, preflightProblems, readPreflightInput } from './rom-preflight.ts'
import type { PreflightInput } from './rom-preflight.ts'

const GIB_IN_KB = 1024 * 1024
const TOOLS = ['arm-none-eabi-gcc', 'arm-none-eabi-nm', 'make', 'python3', 'pkg-config']

const scratch = mkdtempSync(join(tmpdir(), 'irv-preflight-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

function toolDir(name: string, tools: string[]): string {
  const dir = mkdtempSync(join(scratch, `${name}-`))
  for (const tool of tools) {
    writeFileSync(join(dir, tool), '#!/bin/sh\n')
    chmodSync(join(dir, tool), 0o755)
  }
  return dir
}

const baseRom = join(scratch, 'base.gba')
const baseBytes = new Uint8Array(4096).map((_, index) => (index * 7) & 0xff)
writeFileSync(baseRom, baseBytes)
const baseSha1 = createHash('sha1').update(baseBytes).digest('hex')

const meminfo = (availableKb: number) =>
  `MemTotal:       12000000 kB\nMemFree:          900000 kB\nMemAvailable:   ${String(availableKb)} kB\n`

function input(changes: Partial<PreflightInput>): PreflightInput {
  return {
    pathVariable: toolDir('all', TOOLS),
    meminfo: meminfo(5 * GIB_IN_KB),
    baseRomPath: baseRom,
    baseRomSha1: baseSha1,
    ...changes,
  }
}

describe('preflightProblems', () => {
  it('passes with the tools, 5 GiB available and the right base ROM', () => {
    expect(preflightProblems(input({}))).toEqual([])
  })

  it('names a missing gcc and gives the apt line', () => {
    const partial = toolDir('nogcc', TOOLS.slice(1))
    const problems = preflightProblems(input({ pathVariable: `/nonexistent:${partial}` }))
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('arm-none-eabi-gcc')
    expect(problems[0]).toContain(APT_INSTALL)
    expect(APT_INSTALL).toMatch(/sudo apt-get install .*gcc-arm-none-eabi .*pkgconf/)
  })

  it('finds tools spread over several PATH entries', () => {
    const first = toolDir('first', TOOLS.slice(0, 2))
    const second = toolDir('second', TOOLS.slice(2))
    expect(preflightProblems(input({ pathVariable: `${first}::${second}` }))).toEqual([])
  })

  it('does not count a file without the execute bit', () => {
    const dir = toolDir('noexec', TOOLS)
    chmodSync(join(dir, 'make'), 0o644)
    expect(preflightProblems(input({ pathVariable: dir }))[0]).toMatch(/missing make;/)
  })

  it('refuses to build with 2 GiB available', () => {
    expect(preflightProblems(input({ meminfo: meminfo(2 * GIB_IN_KB) }))).toEqual([
      expect.stringMatching(/2\.0 GiB of memory available, the ROM build needs 3 GiB/),
    ])
  })

  it('refuses a meminfo without MemAvailable', () => {
    expect(preflightProblems(input({ meminfo: 'MemTotal: 1 kB\n' }))).toEqual([
      expect.stringMatching(/no MemAvailable line/),
    ])
  })

  it('names the expected SHA1 for a wrong base ROM', () => {
    const expected = 'f3ae088181bf583e55daf962a92bb46f4f1d07b7'
    const problems = preflightProblems(input({ baseRomSha1: expected }))
    expect(problems).toEqual([expect.stringContaining(`expects ${expected}`)])
    expect(problems[0]).toContain(baseSha1)
  })

  it('names IRV_BASE_ROM for a missing base ROM', () => {
    const problems = preflightProblems(input({ baseRomPath: join(scratch, 'none.gba') }))
    expect(problems).toEqual([
      expect.stringMatching(/no base ROM at .*none\.gba; set IRV_BASE_ROM/),
    ])
  })
})

describe('readPreflightInput', () => {
  it('takes PATH and IRV_BASE_ROM from the environment', () => {
    const read = readPreflightInput({ PATH: '/bin', IRV_BASE_ROM: '/x/emerald.gba' }, baseSha1)
    expect(read).toMatchObject({ pathVariable: '/bin', baseRomPath: '/x/emerald.gba' })
    expect(read.meminfo).toMatch(/MemAvailable/)
  })

  it('defaults the base ROM to the dump in ~/roms', () => {
    expect(readPreflightInput({}, baseSha1)).toMatchObject({
      pathVariable: '',
      baseRomPath: join(homedir(), 'roms', 'Pokemon - Emerald Version (USA, Europe).gba'),
      baseRomSha1: baseSha1,
    })
  })
})
