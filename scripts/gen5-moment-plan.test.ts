import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from '../src/gen5/adapter'
import type { ServerCmdTable } from '../src/gen5/bw2-numbers'
import type { MacroStep } from '../src/gen5/macro'
import type { Moment } from '../src/gen5/moment'
import { momentSteps } from './gen5-moment-plan'

// Invented numbers in the shapes of bw2.json: offsets, command numbers, IDs and the address.
const ADAPTER_NUMBERS: AdapterNumbers = {
  layout: {
    size: 0x4c,
    align: 4,
    fields: {
      returnSize: { offset: 0x08, size: 4 },
      returnData: { offset: 0x10, size: 4 },
      returned: { offset: 0x20, size: 1, bit: 4, bits: 3 },
      cmd: { offset: 0x22, size: 1 },
      state: { offset: 0x23, size: 1 },
      'sendCmd.size': { offset: 0x28, size: 2 },
      'sendCmd.cmd': { offset: 0x2a, size: 2 },
      'sendCmd.data': { offset: 0x2c, size: 0x20 },
    },
  },
  serverCmd: 0x0b,
  selectAction: 6,
  heldState: 2,
  queueSize: 0x40,
}
// Formats without puts: each command packs to its number alone, which the last spec reads.
const TABLE: ServerCmdTable = {
  serverCommands: { SC_MOVE_MSG: 0x0131, SC_MOVE_ANIM: 0x0122 },
  argFormats: {
    TWO: { code: 1, argCount: 2, puts: [] },
    FOUR: { code: 2, argCount: 4, puts: [] },
    NONE: { code: 0, argCount: 0, puts: [] },
  },
  commandFormats: { SC_MOVE_MSG: 'TWO', SC_MOVE_ANIM: 'FOUR' },
  messages: { formats: ['NONE'], soundCommand: 'SC_MSG_STD_SE', argEnd: 0x7eed0000 },
}
const MOMENT: Moment = {
  attacker: { monId: 4, pos: 2 },
  target: { monId: 9, pos: 3, hp: 30, maxHp: 30 },
  move: 33,
  hpAfter: 30,
}
const ADAPTER = 0x02134000

const steps = momentSteps({
  adapterNumbers: ADAPTER_NUMBERS,
  table: TABLE,
  adapter: ADAPTER,
  blocks: [
    { name: 'b1', moment: MOMENT },
    { name: 'b2', moment: { ...MOMENT, attacker: { monId: 9, pos: 3 } } },
  ],
})
const named = (step: MacroStep) => ('name' in step ? `${step.kind} ${step.name}` : step.kind)

// Scene: the server is held before any button reaches the menu, the player answers the menu,
// then each block goes in once the client answered the one before, with no button press between.
describe('momentSteps', () => {
  it('holds, answers the menu, writes each block after the last answer, then asks again', () => {
    expect(steps.map(named)).toEqual([
      'write hold',
      'until answer-menu',
      'mark hp-before',
      'write b1',
      'until b1',
      'mark b1-answered',
      'write b2',
      'until b2',
      'mark b2-answered',
      'write select-action',
      ...['menu-1', 'menu-2', 'menu-3', 'menu-4', 'menu-5'].flatMap((mark) => [
        'wait',
        `mark ${mark}`,
      ]),
      'mark end',
    ])
  })

  it("holds by the adapter's state and waits for `returned` 1 at the adapter", () => {
    expect(steps[0]).toMatchObject({ writes: [{ field: 'state', address: ADAPTER + 0x23 }] })
    expect(steps[1]).toMatchObject({
      checks: [{ address: ADAPTER + 0x20, width: 1, mask: 0x70, oneOf: [0x10] }],
      mash: { buttons: ['A'] },
    })
  })

  it('presses no button from the first block on', () => {
    const fromFirst = steps.slice(3)
    const pressing = fromFirst.filter(
      (step) => step.kind === 'press' || step.kind === 'mash' || 'mash' in step,
    )
    expect(pressing).toEqual([])
  })

  it("puts the packed moment into the block's data", () => {
    const block = steps[3]
    if (block?.kind !== 'write') throw new Error('step 3 is no write')
    expect(block.writes[0]).toMatchObject({ field: 'sendCmd.data', bytes: [1, 0x31, 1, 0x22] })
  })
})
