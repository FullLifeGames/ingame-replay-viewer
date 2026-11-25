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
    },
  }

  it('gives the pin, the counts and the checks, and no address, offset or value', () => {
    expect(quietLines(numbers)).toEqual([
      'pokebw2 c0ffee',
      'symbols 2, adapter commands 2, adapter states 1',
      'server commands 3, formats 1, format table entries 2',
      'outside main RAM: itcm',
      'adapter layout checked: members present, offsets rising, inside the struct, bit-fields shared',
    ])
  })

  it('says so when every symbol lies in main RAM', () => {
    const inside = { ...numbers, symbols: { inside: symbol('inside', 0x02012345) } }
    expect(quietLines(inside)).toContain('all symbols in main RAM')
  })
})
