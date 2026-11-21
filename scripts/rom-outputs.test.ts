import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { applyBps } from '../src/patch/bps-apply.ts'
import { createBps } from '../src/patch/bps-create.ts'
import { checkRoundTrip, makeOutputs, OUTPUT_NAMES, writeOutputs } from './rom-outputs.ts'
import { loadSlotLayout } from './rom-slot.ts'

const layout = loadSlotLayout()
const SLOT_OFFSET = 0x4000
const NM_OUTPUT = `Intr_Main t 08000248 \ngReplaySlot T 08004000 00020000\n`

const sha1 = (bytes: Uint8Array) => createHash('sha1').update(bytes).digest('hex')

// A synthetic base and a built ROM that keeps part of it, moves a block and holds the slot.
function pair(): { base: Uint8Array; rom: Uint8Array } {
  const base = new Uint8Array(0x30000).map((_, index) => (index * 31 + (index >> 9)) & 0xff)
  const rom = new Uint8Array(0x40000).fill(0xff)
  rom.set(base.subarray(0, SLOT_OFFSET))
  rom.fill(0, SLOT_OFFSET, SLOT_OFFSET + 0x20000)
  rom.set(new TextEncoder().encode('IRV_SLOT'), SLOT_OFFSET)
  const view = new DataView(rom.buffer)
  view.setUint16(SLOT_OFFSET + 0x08, 1, true)
  view.setUint16(SLOT_OFFSET + 0x0a, 0x20, true)
  view.setUint32(SLOT_OFFSET + 0x0c, 0x20000, true)
  rom.set(base.subarray(0x10000, 0x18000), 0x30000)
  return { base, rom }
}

const scratch = mkdtempSync(join(tmpdir(), 'irv-outputs-'))
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

describe('the build outputs', () => {
  const { base, rom } = pair()
  const outputs = makeOutputs({ rom, base, nmOutput: NM_OUTPUT, layout })

  it('describes the slot found through nm', () => {
    expect(outputs.description).toMatchObject({
      offset: SLOT_OFFSET,
      lengthOffset: SLOT_OFFSET + 0x10,
      streamOffset: SLOT_OFFSET + 0x20,
      romSha1: sha1(rom),
      romSize: rom.length,
    })
  })

  it('writes a patch that turns the base into the built ROM', () => {
    expect(sha1(applyBps(outputs.patch, base))).toBe(sha1(rom))
  })

  it('records the SHA1s of ROM, patch and base', () => {
    expect(outputs.sha1).toEqual({ rom: sha1(rom), patch: sha1(outputs.patch), base: sha1(base) })
  })

  it('refuses a ROM whose slot nm does not list', () => {
    const run = () => makeOutputs({ rom, base, nmOutput: 'Intr_Main t 08000248 \n', layout })
    expect(run).toThrow('gReplaySlot not in the ELF')
  })

  it('writes the patch and the description under their names', () => {
    writeOutputs(scratch, outputs)
    expect(readFileSync(join(scratch, OUTPUT_NAMES.patch))).toEqual(Buffer.from(outputs.patch))
    const description: unknown = JSON.parse(readFileSync(join(scratch, OUTPUT_NAMES.slot), 'utf8'))
    expect(description).toEqual(outputs.description)
  })
})

describe('the round trip', () => {
  const { base, rom } = pair()

  it('passes when the patch gives the built ROM', () => {
    expect(() => {
      checkRoundTrip(createBps(base, rom), base, rom)
    }).not.toThrow()
  })

  it('names both SHA1s when the patch gives another ROM', () => {
    const other = rom.slice()
    other[0x100] = (other[0x100] as number) ^ 0xff
    expect(() => {
      checkRoundTrip(createBps(base, other), base, rom)
    }).toThrow(
      `the patch applied to the base ROM gives SHA1 ${sha1(other)}, the built ROM has ${sha1(rom)}`,
    )
  })
})
