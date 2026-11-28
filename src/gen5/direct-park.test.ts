import { describe, expect, it } from 'vitest'

import { ENTRY, ROUTINE } from './direct-entry.fixtures'
import { park, type ParkSides } from './direct-park'
import { takeover } from './direct-takeover'
import type { MacroStep } from './macro'
import { failingCheck, type RamCheck, type ReadRam } from './ram-check'
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
/** Invented sealed Pokémon of PartyPkm's size: two for the player, one for the opponent. */
const pkm = (seed: number) => Uint8Array.from({ length: 0x60 }, (_, i) => (seed * 3 + i) % 256)
const SIDES: ParkSides = {
  names: NAMES,
  parties: { player: [pkm(1), pkm(2)], opponent: [pkm(3)] },
  style: 'single',
}
const withNames = (names: ParkSides['names']): ParkSides => ({ ...SIDES, names })

const writesOf = (step: MacroStep | undefined): readonly MemoryWrite[] =>
  step?.kind === 'write' ? step.writes : []
const named = (steps: readonly MacroStep[], name: string) =>
  steps.find((step) => 'name' in step && step.name === name)

// Scene: the routine waits at the park; the page writes both sides, then the go, and from the
// battle's start the page presses A through the opening to the action menu.
describe('park', () => {
  const { steps, notes } = park(ENTRY, boot, SIDES, BATTLE)

  it('checks the setup, writes the park, then the go, waits for gone and enters the battle', () => {
    const names = steps.map((step) => ('name' in step ? `${step.kind} ${step.name}` : step.kind))
    expect(names).toEqual([
      'until park-check',
      'write park',
      'until park-written',
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

  it('writes the names, the class, the speed, the style, the music and both parties, then the go', () => {
    expect(writesOf(named(steps, 'park')).map((write) => write.field)).toEqual([
      'opponent.name length',
      'opponent.name',
      'opponent.trainerClass',
      'player.name',
      'config.textSpeed',
      'battleStyle',
      'fieldSituation.bgm',
      'player.party.pkms[0]',
      'player.party.pkms[1]',
      'player.party.count',
      'player.party.slotExists',
      'opponent.party.pkms[0]',
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

  it("reads the setup and both clients' party pointers, which the parties are written behind", () => {
    const { watch } = park(ENTRY, boot, SIDES, BATTLE)
    expect(watch).toEqual([
      { name: 'stage', address: STAGE, width: 4 },
      { name: 'setup', address: SETUP, width: 4 },
      { name: 'player.party', address: SETUP, hops: [0x20], width: 4 },
      { name: 'opponent.party', address: SETUP, hops: [0x1c], width: 4 },
    ])
  })

  it('marks the opening every 30 frames, so the intro with the written names shows', () => {
    expect(named(steps, 'action')).toMatchObject({ kind: 'until', markEvery: 30 })
  })

  // E-5's two runs measured gone 11 frames after the go, the adapter 27 after gone and the action
  // menu 652 after the adapter; the limits leave room, the most for the opening of a double.
  it('waits for gone, the adapter and the action menu within limits fitted to the runs', () => {
    expect(named(steps, 'gone')).toMatchObject({ limit: 30 })
    expect(named(steps, 'battle-start')).toMatchObject({ limit: 120 })
    expect(named(steps, 'action')).toMatchObject({ limit: 1000 })
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
      hops: [0x50, 0x08, 10],
      bytes: [0x42, 0, 0x6f, 0, 0xfe, 0xff],
    })
    expect(of('opponent.name length')).toMatchObject({ hops: [0x50, 0x08, 4], bytes: [2, 0] })
    expect(of('opponent.trainerClass')).toMatchObject({
      hops: [0x50, 0x10],
      bytes: [0x21, 0, 0, 0],
    })
    expect(of('player.name')).toMatchObject({
      hops: [0x44, 0],
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
  })

  it("checks the opponent's buffer and both parties' room before it writes", () => {
    const check = named(steps, 'park-check')
    const checks = check?.kind === 'until' ? check.checks : []
    expect(check).toMatchObject({ limit: 0 })
    expect(checks.map((one) => one.name)).toEqual([
      'setup',
      'opponent.name size',
      'player.party.capacity',
      'opponent.party.capacity',
      'opponent.party.count',
    ])
    expect(checks[1]).toMatchObject({ hops: [0x50, 0x08, 6], width: 2, oneOf: [9] })
    expect(checks[2]).toMatchObject({ hops: [0x20, 8], oneOf: [5] })
    expect(checks[3]).toMatchObject({ hops: [0x1c, 8], oneOf: [5] })
    expect(checks[4]).toMatchObject({ hops: [0x1c, 0], oneOf: [0] })
  })

  // Scene: a run without a save. The game's party is empty, so the setup's copy of it is too.
  it("passes a setup whose player party is empty, and fails on an opponent's Pokémon", () => {
    const check = named(steps, 'park-check')
    const checks = check?.kind === 'until' ? check.checks : []
    const memory = setupMemory()
    expect(failingCheck(checks, memory.read)).toBeUndefined()
    memory.put(OPPONENT_PARTY, [1, 0, 0, 0])
    expect(failingCheck(checks, memory.read)).toMatch(/^opponent\.party\.count/)
  })

  it('writes the battle style by name: a single, or a double', () => {
    const style = (sides: ParkSides) =>
      writesOf(named(park(ENTRY, boot, sides, BATTLE).steps, 'park')).find(
        (write) => write.field === 'battleStyle',
      )
    expect(style(SIDES)).toEqual({
      kind: 'bytes',
      field: 'battleStyle',
      address: SETUP,
      hops: [0x0c],
      bytes: [4, 0, 0, 0],
    })
    expect(style({ ...SIDES, style: 'double' })).toMatchObject({ bytes: [6, 0, 0, 0] })
  })

  it("writes the trainer's track into the music word", () => {
    const writes = writesOf(named(steps, 'park'))
    expect(writes.find((write) => write.field === 'fieldSituation.bgm')).toEqual({
      kind: 'bytes',
      field: 'fieldSituation.bgm',
      address: SETUP,
      hops: [0x0a],
      bytes: [0xa7, 0x03],
    })
  })

  it('copies nothing: every Pokémon of the park is written as bytes', () => {
    const writes = writesOf(named(steps, 'park'))
    expect(writes.filter((write) => write.kind === 'copy')).toEqual([])
  })

  it('reads back the style, the music and both counts in the frame after the write', () => {
    const at = steps.findIndex((step) => step.kind === 'write' && step.name === 'park')
    expect(steps[at + 1]).toMatchObject({ kind: 'until', name: 'park-written', limit: 0 })
    expect(steps[at + 2]).toMatchObject({ kind: 'until', name: 'go-region' })
    const step = steps[at + 1]
    const checks = step?.kind === 'until' ? step.checks : []
    expect(checks).toEqual([
      { name: 'battleStyle', address: SETUP, hops: [0x0c], width: 4, oneOf: [4] },
      { name: 'fieldSituation.bgm', address: SETUP, hops: [0x0a], width: 2, oneOf: [0x3a7] },
      { name: 'player.party.count', address: SETUP, hops: [0x20, 0], width: 4, oneOf: [2] },
      { name: 'opponent.party.count', address: SETUP, hops: [0x1c, 0], width: 4, oneOf: [1] },
    ])
  })

  it('cuts names past their room and gives the cuts for the log', () => {
    const long = park(
      ENTRY,
      boot,
      withNames({ player: 'Annabel', opponent: 'Bartholomew' }),
      BATTLE,
    )
    expect(long.notes).toEqual([
      'opponent.name: "Bartholomew" cut to "Bartholo", the 8 characters it holds',
      'player.name: "Annabel" cut to "Annab", the 5 characters it holds',
    ])
  })

  it('throws on a text speed whose bits leave their byte', () => {
    const config = {
      size: 6,
      align: 8,
      fields: { textSpeed: { offset: 0, size: 2, bit: 6, bits: 4 } },
    }
    const entry = { ...ENTRY, layouts: { ...ENTRY.layouts, Config: config } }
    expect(() => park(entry, boot, SIDES, BATTLE)).toThrow(/textSpeed/)
  })
  it('throws on a text speed that is no bit-field, a count of no width and no name buffer size', () => {
    const layouts = (struct: string, fields: object) => ({
      ...ENTRY.layouts,
      [struct]: { size: 0x260, align: 8, fields: { ...ENTRY.layouts[struct]?.fields, ...fields } },
    })
    const speed = { ...ENTRY, layouts: layouts('Config', { textSpeed: { offset: 0, size: 2 } }) }
    expect(() => park(speed, boot, SIDES, BATTLE)).toThrow(
      'config.textSpeed is no bit-field in one byte',
    )
    const count = { ...ENTRY, layouts: layouts('PokeParty', { count: { offset: 0, size: 3 } }) }
    expect(() => park(count, boot, SIDES, BATTLE)).toThrow('PokeParty.count fills no byte')
    const sizes = { ...ENTRY, bufferSizes: {} }
    expect(() => park(sizes, boot, SIDES, BATTLE)).toThrow("no size of the trainer's name buffer")
  })
})

/** Invented places of the setup's objects in main RAM, behind the block's setup word. */
const SETUP_AT = 0x02180000
const PLAYER_PARTY = 0x02190000
const OPPONENT_PARTY = 0x021a0000
const TRAINER = 0x021b0000
const STRBUF = 0x021c0000

const le = (value: number) => [0, 8, 16, 24].map((shift) => (value >>> shift) & 0xff)

/** The setup as the routine parks it with no save: both parties empty, each of five places. */
function setupMemory(): {
  read: ReadRam
  put: (address: number, bytes: readonly number[]) => void
} {
  const bytes = new Map<number, number>()
  const put = (address: number, values: readonly number[]) => {
    values.forEach((value, i) => bytes.set(address + i, value))
  }
  const read: ReadRam = (address, width) => {
    let value = 0
    for (let i = width - 1; i >= 0; i -= 1) value = value * 256 + (bytes.get(address + i) ?? 0)
    return value
  }
  put(SETUP, le(SETUP_AT))
  put(SETUP_AT + 0x20, le(PLAYER_PARTY))
  put(SETUP_AT + 0x1c, le(OPPONENT_PARTY))
  put(SETUP_AT + 0x50, le(TRAINER))
  put(TRAINER + 0x08, le(STRBUF))
  put(STRBUF + 6, [9, 0])
  for (const party of [PLAYER_PARTY, OPPONENT_PARTY]) put(party + 8, le(5))
  return { read, put }
}
