import { describe, expect, it } from 'vitest'

import type { Gen5Block } from '../src/gen5/backend/replay'
import type { BattleNumbers } from '../src/gen5/bw2-numbers'
import { type PartyStart, partyLines, partyRefs } from './gen5-moment-party'

// Invented numbers: the mon ID's offset in BattleMonCore, the slots' addresses, the clients and
// the mon IDs. The species are national dex numbers, which @pkmn names.
const MON_ID_AT = 0x31
const NUMBERS = {
  battle: { monCore: { size: 0x40, fields: { monId: { offset: MON_ID_AT, size: 1 } } } },
} as unknown as { battle: BattleNumbers }
const POLITOED = 186
const FERROTHORN = 598
const KELDEO = 647
const DARMANITAN = 555
const BLISSEY = 242

const START: PartyStart = {
  near: {
    client: 3,
    slots: 0x02180010,
    mons: [
      { monId: 20, species: POLITOED },
      { monId: 21, species: FERROTHORN },
      { monId: 22, species: KELDEO },
    ],
  },
  far: {
    client: 5,
    slots: 0x02180100,
    mons: [
      { monId: 40, species: DARMANITAN },
      { monId: 41, species: BLISSEY },
    ],
  },
}

/** A block that sends `slot` of `client` in, as the backend writes it. */
const sendIn = (name: string, client: number, slot: number): Gen5Block => ({
  name,
  lines: [9],
  commands: [
    { command: 'SC_OP_SEND_IN', args: [client, 0, slot, 1] },
    { command: 'SC_SEND_OUT', args: [client, 0, slot, 1] },
  ],
})
const BLOCKS: Gen5Block[] = [
  { name: 'b1', lines: [7], commands: [{ command: 'SC_MOVE_MSG', args: [20, 33] }] },
  sendIn('b2', 3, 2),
  sendIn('b3', 5, 1),
]

/** A mark's values as the page logs them: `name=0x…` for each slot. */
const values = (near: number[], far: number[]) =>
  [
    ...near.map((id, i) => `near.slot${String(i)}=0x${id.toString(16)}`),
    ...far.map((id, i) => `far.slot${String(i)}=0x${id.toString(16)}`),
  ].join(' ')

// Scene: the switches scene's run reads the client's party order from RAM at each block's answer
// and checks it against the order the blocks' send-ins give (#108, D9).
describe('partyRefs', () => {
  it('reads each slot’s pointer and hops to the mon ID of the Pokémon it points at', () => {
    expect(partyRefs({ parties: START }, NUMBERS)).toEqual([
      { name: 'near.slot0', address: 0x02180010, hops: [MON_ID_AT], width: 1 },
      { name: 'near.slot1', address: 0x02180014, hops: [MON_ID_AT], width: 1 },
      { name: 'near.slot2', address: 0x02180018, hops: [MON_ID_AT], width: 1 },
      { name: 'far.slot0', address: 0x02180100, hops: [MON_ID_AT], width: 1 },
      { name: 'far.slot1', address: 0x02180104, hops: [MON_ID_AT], width: 1 },
    ])
  })

  it('fails by name when BattleMonCore has no mon ID', () => {
    const none = { battle: { monCore: { size: 0x40, fields: {} } } } as unknown as typeof NUMBERS
    expect(() => partyRefs({ parties: START }, none)).toThrow(
      'the layout of BattleMonCore has no field monId',
    )
  })
})

describe('partyLines', () => {
  const marks = [
    { name: 'battle', values: '' },
    { name: 'b1-answered', values: values([20, 21, 22], [40, 41]) },
    { name: 'b2-answered', values: values([22, 21, 20], [40, 41]) },
    { name: 'b3-answered', values: values([22, 21, 20], [41, 40]) },
  ]

  it('reads each block’s mark into both orders and names each front as the state has it', () => {
    expect(partyLines(BLOCKS, marks, START)).toEqual({
      lines: [
        'b1-answered: near front Politoed, mon ID 20; far front Darmanitan, mon ID 40; both parties as the state has them',
        'b2-answered: near front Keldeo, mon ID 22; far front Darmanitan, mon ID 40; both parties as the state has them',
        'b3-answered: near front Keldeo, mon ID 22; far front Blissey, mon ID 41; both parties as the state has them',
      ],
      matches: true,
    })
  })

  it('names both orders of a side that differs, and fails', () => {
    const swapped = marks.map((mark) =>
      mark.name === 'b2-answered' ? { ...mark, values: values([21, 20, 22], [40, 41]) } : mark,
    )
    const { lines, matches } = partyLines(BLOCKS, swapped, START)
    expect(matches).toBe(false)
    expect(lines[1]).toBe(
      'b2-answered: near party reads Ferrothorn 21, Politoed 20, Keldeo 22; the state has Keldeo 22, Ferrothorn 21, Politoed 20',
    )
    expect(lines[2]).toMatch(/both parties as the state has them$/)
  })

  it('names a slot whose pointer led nowhere and a block with no mark', () => {
    const cut = [
      {
        name: 'b1-answered',
        values: 'near.slot0=0x14 near.slot1=0x15 far.slot0=0x28 far.slot1=0x29',
      },
    ]
    const { lines, matches } = partyLines(BLOCKS, cut, START)
    expect(matches).toBe(false)
    expect(lines).toEqual([
      'b1-answered: near party reads Politoed 20, Ferrothorn 21, none; the state has Politoed 20, Ferrothorn 21, Keldeo 22',
      'b2-answered: no mark',
      'b3-answered: no mark',
    ])
  })
})
