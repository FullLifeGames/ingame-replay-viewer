import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from '../src/gen5/adapter'
import { ADAPTER_LAYOUT } from '../src/gen5/adapter.fixtures'
import type { ServerCmdTable } from '../src/gen5/bw2-numbers'
import type { MacroStep } from '../src/gen5/macro'
import type { Moment } from '../src/gen5/moment'
import { MOMENT_GAP, momentStart, momentSteps } from './gen5-moment-plan'

// Invented numbers in the shapes of bw2.json: offsets, command numbers, IDs and the address.
/** The adapter command that starts an action selection (BTL_ACMD_SELECT_ACTION), invented. */
const SELECT_ACTION = 6
const ADAPTER_NUMBERS: AdapterNumbers = {
  layout: ADAPTER_LAYOUT,
  serverCmd: 0x0b,
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
  it('holds, answers the menu, writes each block after the last answer, then ends', () => {
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

/** The adapter commands that the writes after the hold put into `cmd` or `sendCmd.cmd`. */
function commandsAfterHold(plan: MacroStep[]): Set<number> {
  const afterHold = plan.slice(plan.findIndex((step) => 'name' in step && step.name === 'hold') + 1)
  const writes = afterHold.flatMap((step) => (step.kind === 'write' ? step.writes : []))
  return new Set(
    writes.flatMap((write) =>
      write.kind === 'bytes' && (write.field === 'cmd' || write.field === 'sendCmd.cmd')
        ? [write.bytes.reduceRight((value, byte) => value * 256 + byte, 0)]
        : [],
    ),
  )
}

// Scene: the client never starts an action selection during a replay, so no trainer's hint line
// shows (CheckTrainerHintMsg in pokebw2's btl_client.c); after the hold it gets server commands only.
describe('momentSteps after the hold', () => {
  it('writes no action-selection command, only the server command', () => {
    const commands = commandsAfterHold(steps)
    expect(commands).not.toContain(SELECT_ACTION)
    expect([...commands]).toEqual([ADAPTER_NUMBERS.serverCmd])
  })
})

// Scene: two equal runs must start the moment at the same frame, while the script reads the
// battle in wall time between the session and the moment.
describe('momentStart', () => {
  it('starts the moment a fixed gap after the mark battle, wide enough for the reading', () => {
    const marks = [
      { name: 'action', frame: 300 },
      { name: 'battle', frame: 350 },
    ]
    expect(MOMENT_GAP).toBeGreaterThanOrEqual(300)
    expect(momentStart(marks)).toBe(350 + MOMENT_GAP)
  })

  it('leaves the start open for a session with no mark battle', () => {
    expect(momentStart([{ name: 'title', frame: 40 }])).toBeUndefined()
  })
})
