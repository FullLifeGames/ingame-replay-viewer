import { describe, expect, it } from 'vitest'

import { ENTRY, ROUTINE } from './direct-entry.fixtures'
import { park } from './direct-park'
import { takeover } from './direct-takeover'
import type { MacroStep } from './macro'
import type { RamCheck } from './ram-check'
import type { MemoryWrite } from './ram-write'

// Every address, offset, size and constant here is invented (direct-entry.fixtures.ts).

const SETUP = 0x0230003c
const STAGE = 0x02300030
const GO = 0x02300034

/** Invented battle checks: the adapter's pointer and a mode. */
const BATTLE: RamCheck[] = [
  { name: 'adapter', address: 0x02150000, width: 4, mainRamPointer: true },
  { name: 'mode', address: 0x02150004, width: 4, oneOf: [2] },
]

const boot = takeover(ENTRY, ROUTINE)
const NAMES = { player: 'Ann', opponent: 'Bo' }

const writesOf = (step: MacroStep | undefined): readonly MemoryWrite[] =>
  step?.kind === 'write' ? step.writes : []
const named = (steps: readonly MacroStep[], name: string) =>
  steps.find((step) => 'name' in step && step.name === name)

// Scene: the routine waits at the park; the page writes both sides, then the go, and from the
// battle's start the page presses A through the opening to the action menu.
describe('park', () => {
  const { steps, notes } = park(ENTRY, boot, NAMES, BATTLE)

  it('checks the setup, writes the park, then the go, waits for gone and enters the battle', () => {
    const names = steps.map((step) => ('name' in step ? `${step.kind} ${step.name}` : step.kind))
    expect(names).toEqual([
      'until park-check',
      'write park',
      'until go-region',
      'write go',
      'until gone',
      'mark gone',
      'until battle-start',
      'mark battle-start',
      'until action',
      'mark action',
      'until battle',
      'mark battle',
    ])
    expect(notes).toEqual([])
  })

  it('writes the names, the class, the text speed and the party before the go, the go alone', () => {
    expect(writesOf(named(steps, 'park')).map((write) => write.field)).toEqual([
      'opponent.name length',
      'opponent.name',
      'opponent.trainerClass',
      'player.name',
      'config.textSpeed',
      'opponent.party',
      'opponent.party.count',
      'opponent.party.slotExists',
    ])
    expect(writesOf(named(steps, 'go'))).toEqual([
      { kind: 'bytes', field: 'go', address: GO, bytes: [1, 0, 0, 0] },
    ])
  })

  it("checks the routine's region in the frame before the go, as at the takeover and the park", () => {
    const at = steps.findIndex((step) => step.kind === 'until' && step.name === 'go-region')
    expect(steps[at]).toEqual({
      kind: 'until',
      name: 'go-region',
      checks: boot.region,
      holdFor: 1,
      limit: 0,
    })
    expect(steps[at + 1]).toMatchObject({ kind: 'write', name: 'go' })
    expect(boot.region.length).toBeGreaterThan(0)
  })

  it("reads the setup and both clients' party pointers, which the copy goes through", () => {
    const { watch } = park(ENTRY, boot, NAMES, BATTLE)
    expect(watch).toEqual([
      { name: 'stage', address: STAGE, width: 4 },
      { name: 'setup', address: SETUP, width: 4 },
      { name: 'player.party', address: SETUP, hops: [0x20], width: 4 },
      { name: 'opponent.party', address: SETUP, hops: [0x24], width: 4 },
    ])
  })

  it('marks the opening every 30 frames, so the intro with the written names shows', () => {
    expect(named(steps, 'action')).toMatchObject({ kind: 'until', markEvery: 30 })
  })

  it('writes nothing after the wait for gone', () => {
    const gone = steps.findIndex((step) => step.kind === 'until' && step.name === 'gone')
    expect(steps.slice(gone).filter((step) => step.kind === 'write')).toEqual([])
  })

  it("writes each side through the setup's pointers", () => {
    const writes = writesOf(named(steps, 'park'))
    const of = (field: string) => writes.find((write) => write.field === field)
    expect(of('opponent.name')).toMatchObject({
      address: SETUP,
      hops: [0x48, 0x14, 8],
      bytes: [0x42, 0, 0x6f, 0, 0xfe, 0xff],
    })
    expect(of('opponent.name length')).toMatchObject({ hops: [0x48, 0x14, 2], bytes: [2, 0] })
    expect(of('opponent.trainerClass')).toMatchObject({ hops: [0x48, 4], bytes: [0x21, 0, 0, 0] })
    expect(of('player.name')).toMatchObject({
      hops: [0x30, 0],
      bytes: [0x41, 0, 0x6e, 0, 0x6e, 0, 0xfe, 0xff],
    })
    expect(of('config.textSpeed')).toEqual({
      kind: 'bits',
      field: 'config.textSpeed',
      address: SETUP,
      hops: [0x68, 0],
      mask: 0x1c,
      value: 3 << 2,
    })
    expect(of('opponent.party')).toEqual({
      kind: 'copy',
      field: 'opponent.party',
      from: { address: SETUP, hops: [0x20, 8] },
      to: { address: SETUP, hops: [0x24, 8] },
      length: 0x60,
    })
    expect(of('opponent.party.count')).toMatchObject({ hops: [0x24, 4], bytes: [1, 0, 0, 0] })
    expect(of('opponent.party.slotExists')).toMatchObject({
      hops: [0x24, 0x248],
      mask: 1,
      value: 1,
    })
  })

  it("checks the opponent's buffer and both parties before it writes", () => {
    const check = named(steps, 'park-check')
    const checks = check?.kind === 'until' ? check.checks : []
    expect(check).toMatchObject({ limit: 0 })
    expect(checks.map((one) => one.name)).toEqual([
      'setup',
      'opponent.name size',
      'player.party.count',
      'opponent.party.count',
    ])
    expect(checks[1]).toMatchObject({ hops: [0x48, 0x14, 0], width: 2, oneOf: [9] })
    expect(checks[2]).toMatchObject({ hops: [0x20, 4], noneOf: [0] })
    expect(checks[3]).toMatchObject({ hops: [0x24, 4], oneOf: [0] })
  })

  it('cuts names past their room and gives the cuts for the log', () => {
    const long = park(ENTRY, boot, { player: 'Annabel', opponent: 'Bartholomew' }, BATTLE)
    expect(long.notes).toEqual([
      'opponent.name: "Bartholomew" cut to "Bartholo", the 8 characters it holds',
      'player.name: "Annabel" cut to "Annab", the 5 characters it holds',
    ])
  })

  it('throws on a text speed whose bits leave their byte', () => {
    const config = {
      size: 4,
      align: 4,
      fields: { textSpeed: { offset: 0, size: 2, bit: 6, bits: 4 } },
    }
    const entry = { ...ENTRY, layouts: { ...ENTRY.layouts, Config: config } }
    expect(() => park(entry, boot, NAMES, BATTLE)).toThrow(/textSpeed/)
  })
  it('throws on a text speed that is no bit-field, a count of no width and no name buffer size', () => {
    const layouts = (struct: string, fields: object) => ({
      ...ENTRY.layouts,
      [struct]: { size: 0x260, align: 4, fields: { ...ENTRY.layouts[struct]?.fields, ...fields } },
    })
    const speed = { ...ENTRY, layouts: layouts('Config', { textSpeed: { offset: 0, size: 2 } }) }
    expect(() => park(speed, boot, NAMES, BATTLE)).toThrow(
      'config.textSpeed is no bit-field in one byte',
    )
    const count = { ...ENTRY, layouts: layouts('PokeParty', { count: { offset: 4, size: 3 } }) }
    expect(() => park(count, boot, NAMES, BATTLE)).toThrow('PokeParty.count fills no byte')
    const sizes = { ...ENTRY, bufferSizes: {} }
    expect(() => park(sizes, boot, NAMES, BATTLE)).toThrow("no size of the trainer's name buffer")
  })
})
