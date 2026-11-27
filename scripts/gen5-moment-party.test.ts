import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import type { PartyOrders } from '../src/gen5/backend/moves'
import type { Gen5Block } from '../src/gen5/backend/replay'
import type { BattleNumbers } from '../src/gen5/bw2-numbers'
import { type PartyStart, partyLines, partyRefs } from './gen5-moment-party'

// Invented numbers: the mon ID's offset in BattleMonCore, the slots' addresses, the clients and
// the mon IDs. The species are national dex numbers, read from @pkmn.
const MON_ID_AT = 0x31
const NUMBERS = {
  battle: { monCore: { size: 0x40, fields: { monId: { offset: MON_ID_AT, size: 1 } } } },
} as unknown as { battle: BattleNumbers }
/** A species' national dex number, from @pkmn. */
const dex = (name: string) => Dex.species.get(name).num

const START: PartyStart = {
  near: {
    client: 3,
    slots: 0x02180010,
    mons: [
      { monId: 20, species: dex('Politoed') },
      { monId: 21, species: dex('Ferrothorn') },
      { monId: 22, species: dex('Keldeo') },
    ],
  },
  far: {
    client: 5,
    slots: 0x02180100,
    mons: [
      { monId: 40, species: dex('Darmanitan') },
      { monId: 41, species: dex('Blissey') },
    ],
  },
}

/** A block of log line `line` that sends `slot` of `client` in, as the backend writes it. */
const sendIn = (name: string, line: number, client: number, slot: number): Gen5Block => ({
  name,
  lines: [line],
  commands: [
    { command: 'SC_OP_SEND_IN', args: [client, 0, slot, 1] },
    { command: 'SC_SEND_OUT', args: [client, 0, slot, 1] },
  ],
})
const BLOCKS: Gen5Block[] = [
  { name: 'b1', lines: [7], commands: [{ command: 'SC_MOVE_MSG', args: [20, 33] }] },
  sendIn('b2', 9, 3, 2),
  sendIn('b3', 10, 5, 1),
]

/** The backend's party orders after each event, by line, as the writer keeps them. */
const ORDERS: PartyOrders[] = [
  { line: 7, near: [20, 21, 22], far: [40, 41] },
  { line: 9, near: [22, 21, 20], far: [40, 41] },
  { line: 10, near: [22, 21, 20], far: [41, 40] },
]

/** A mark's values as the page logs them: `name=0x…` for each slot. */
const values = (near: number[], far: number[]) =>
  [
    ...near.map((id, i) => `near.slot${String(i)}=0x${id.toString(16)}`),
    ...far.map((id, i) => `far.slot${String(i)}=0x${id.toString(16)}`),
  ].join(' ')

// Scene: the switches scene's run reads the client's party order from RAM at each block's answer
// and checks it against the order the backend's battle state holds after the block (#108, D9).
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
    expect(partyLines(BLOCKS, marks, START, ORDERS)).toEqual({
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
    const { lines, matches } = partyLines(BLOCKS, swapped, START, ORDERS)
    expect(matches).toBe(false)
    expect(lines[1]).toBe(
      'b2-answered: near party reads Ferrothorn 21, Politoed 20, Keldeo 22; the state has Keldeo 22, Ferrothorn 21, Politoed 20',
    )
    expect(lines[2]).toMatch(/both parties as the state has them$/)
  })

  it('fails by name where a send-in moves the game other than the state', () => {
    // The backend's state sent Ferrothorn in at b2, but the block's SC_OP_SEND_IN names slot 2:
    // the game follows the command, so RAM reads Keldeo in front.
    const wrong = ORDERS.map((one) =>
      one.line === 9
        ? { ...one, near: [21, 20, 22] }
        : one.line === 10
          ? { ...one, near: [21, 20, 22] }
          : one,
    )
    const { lines, matches } = partyLines(BLOCKS, marks, START, wrong)
    expect(matches).toBe(false)
    expect(lines[1]).toBe(
      'b2-answered: near party reads Keldeo 22, Ferrothorn 21, Politoed 20; the state has Ferrothorn 21, Politoed 20, Keldeo 22',
    )
  })

  it('names a block whose last line the state holds no order for', () => {
    const { lines, matches } = partyLines(BLOCKS, marks, START, ORDERS.slice(0, 2))
    expect(matches).toBe(false)
    expect(lines[2]).toBe('b3-answered: the state holds no party order after line 10')
  })

  it('names a slot whose pointer led nowhere and a block with no mark', () => {
    const cut = [
      {
        name: 'b1-answered',
        values: 'near.slot0=0x14 near.slot1=0x15 far.slot0=0x28 far.slot1=0x29',
      },
    ]
    const { lines, matches } = partyLines(BLOCKS, cut, START, ORDERS)
    expect(matches).toBe(false)
    expect(lines).toEqual([
      'b1-answered: near party reads Politoed 20, Ferrothorn 21, none; the state has Politoed 20, Ferrothorn 21, Keldeo 22',
      'b2-answered: no mark',
      'b3-answered: no mark',
    ])
  })
})
