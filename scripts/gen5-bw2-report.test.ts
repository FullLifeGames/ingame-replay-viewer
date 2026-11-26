import { describe, expect, it } from 'vitest'

import type { Bw2Numbers, StructLayout } from '../src/gen5/bw2-numbers'
import { outsideMainRam, quietLines } from './gen5-bw2-report'

// An invented layout; the quiet report reads none of it.
const LAYOUT: StructLayout = { size: 0x50, align: 4, fields: {} }

describe('outsideMainRam', () => {
  it('names each symbol outside 0x02000000 to 0x023FFFFF', () => {
    const at = (name: string, address: number) => ({
      name,
      kind: 'bss' as const,
      address,
      module: 'ov001',
    })
    expect(
      outsideMainRam({
        low: at('low', 0x02000000),
        high: at('high', 0x023ffffc),
        itcm: at('itcm', 0x01ff8000),
        mirror: at('mirror', 0x027ffe00),
      }),
    ).toEqual(['itcm 0x01FF8000', 'mirror 0x027FFE00'])
  })
})

// Scene: CI's log is public, so the quiet report tells that the run checked its numbers and shows
// none of them. Every number here is invented.
describe('quietLines', () => {
  const symbol = (name: string, address: number) => ({
    name,
    kind: 'data' as const,
    address,
    module: 'ov001',
  })
  const numbers: Bw2Numbers = {
    pokebw2: { repository: 'https://example.invalid/pokebw2.git', commit: 'c0ffee' },
    symbols: { inside: symbol('inside', 0x02012345), itcm: symbol('itcm', 0x01ff8123) },
    adapterCommands: { ACMD_A: 7, ACMD_B: 9 },
    adapterStates: { STATE_A: 5 },
    serverCommands: { CMD_A: 11, CMD_B: 13, CMD_MAX: 17 },
    argFormats: { ARGS_NONE: { code: 19, argCount: 0, puts: [] } },
    commandFormats: { CMD_A: 'ARGS_NONE', CMD_B: 'ARGS_NONE' },
    messages: { formats: [], soundCommand: 'CMD_B', argEnd: 23 },
    queueSize: 0x77,
    adapter: LAYOUT,
    battle: {
      server: LAYOUT,
      mainModule: LAYOUT,
      pokeCon: LAYOUT,
      party: LAYOUT,
      monCore: LAYOUT,
      waitSelectSeq: 29,
      single: { clientCount: 3, posClientIds: [2, 0, 1] },
    },
    route: {
      hughTrigger: { x: 1, z: 31, width: 2 },
      battleTrigger: { x: 1, z: 33, width: 2 },
      outlookTrigger: { x: 1, z: 37, width: 2 },
      bianca: { x: 2, z: 29 },
    },
    saveTrainer: { x: 3, z: 41 },
    entry: {
      functions: {
        Spin_Main: { call: 0x02004001, thumb: true },
        Spin_Arm: { call: 0x02004100, thumb: false },
      },
      data: { sTable: symbol('sTable', 0x02100000) },
      constants: { HEAPID_SPIN: 43 },
      layouts: { Kite: LAYOUT, Lamp: LAYOUT },
      bufferSizes: { Kite_Create: 9 },
      battleOverlay: { start: 0x02190000, end: 0x02190600 },
      bootOverlays: { ovA: { start: 0x02180000, end: 0x02190000 } },
    },
    pkm: {
      layouts: { PartyPkm: LAYOUT, PkmBlockA: LAYOUT, PkmBlockB: LAYOUT },
      blockColumns: { PkmBlockA: 1, PkmBlockB: 0 },
      blockOffsets: [
        [0, 0x18],
        [0x18, 0],
      ],
      selector: { mask: 0x30, shift: 4 },
      cipher: { multiplier: 0x2f1, increment: 0x55, shift: 12 },
      shinyBelow: 5,
      constants: { PARTY_SIZE: 3 },
      species: { SPECIES_NONE: 0, SPECIES_BUDLING: 1 },
      moves: { MOVE_POKE: 2 },
      items: { ITEM_ACORN: 3 },
      abilities: { ABILITY_STURDY_ROOTS: 4 },
      natures: { NATURE_CALM: 5 },
    },
  }

  it('gives the pin, the count of symbols and the checks, and no address, offset or value', () => {
    expect(quietLines(numbers)).toEqual([
      'pokebw2 c0ffee',
      'symbols 2',
      'outside main RAM: itcm',
      'adapter layout checked: members present, offsets rising, inside the struct, bit-fields shared',
      'entry functions in ARM: Spin_Arm',
      'entry symbols all in main RAM',
      'battle overlay in main RAM, apart from the boot overlays',
      'entry layouts Kite, Lamp',
      'pkm layouts PartyPkm, PkmBlockA, PkmBlockB; block table, cipher and shiny bound read',
    ])
  })

  // Scene: the direct entry's numbers (#97) reach the public log as names and checks alone.
  it("names the entry's ARM functions and its symbols outside main RAM, and no number", () => {
    const entry = {
      ...numbers.entry,
      functions: { Spin_Main: { call: 0x02004001, thumb: true } },
      data: { itcm: symbol('itcm', 0x01ff8123) },
      battleOverlay: { start: 0x023ffc00, end: 0x02400400 },
    }
    const lines = quietLines({ ...numbers, entry })
    expect(lines).toContain('entry functions all Thumb')
    expect(lines).toContain('entry symbols outside main RAM: itcm')
    expect(lines).toContain('battle overlay outside main RAM, apart from the boot overlays')
  })

  // Scene: each of pokebw2's lists runs from 0, so its size would give away its last entry's
  // number. The invented lists here have sizes of their own; no line but the pin's and the count
  // of our own symbol names may hold a digit.
  it("prints no size of pokebw2's lists", () => {
    const names = <T>(prefix: string, size: number, value: T) =>
      Object.fromEntries(
        Array.from({ length: size }, (_, at) => [`${prefix}_${String(at)}`, value]),
      )
    const sized: Bw2Numbers = {
      ...numbers,
      adapterCommands: names('ACMD', 3, 0),
      adapterStates: names('STATE', 4, 0),
      serverCommands: names('CMD', 5, 0),
      argFormats: names('ARGS', 6, { code: 0, argCount: 0, puts: [] }),
      commandFormats: names('CMD', 7, 'ARGS_0'),
      pkm: { ...numbers.pkm, species: names('SPECIES', 8, 0), moves: names('MOVE', 9, 0) },
    }
    const [pin, ...rest] = quietLines(sized)
    expect(pin).toBe('pokebw2 c0ffee')
    expect(rest.filter((line) => line !== 'symbols 2' && /\d/.test(line))).toEqual([])
  })

  it('says so when every symbol lies in main RAM', () => {
    const inside = { ...numbers, symbols: { inside: symbol('inside', 0x02012345) } }
    expect(quietLines(inside)).toContain('all symbols in main RAM')
  })
})
