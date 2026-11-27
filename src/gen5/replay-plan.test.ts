import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from './adapter.ts'
import { ADAPTER_LAYOUT } from './adapter.fixtures.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import { REPLAY_NUMBERS } from './backend/replay.fixtures.ts'
import type { MacroStep } from './macro.ts'
import { answered, checkReplay, replaySteps } from './replay-plan.ts'

// Invented numbers: the adapter of src/gen5's fixtures, an adapter command and an address.
const ADAPTER_NUMBERS: AdapterNumbers = {
  layout: ADAPTER_LAYOUT,
  serverCmd: 0x0b,
  heldState: 2,
  queueSize: REPLAY_NUMBERS.queueSize,
}
const ADAPTER = 0x02134000
const SETUP = {
  adapterNumbers: ADAPTER_NUMBERS,
  table: REPLAY_NUMBERS,
  adapter: ADAPTER,
  pin: 'c0ffee',
}

const REPLAY: Gen5Replay = {
  version: GEN5_REPLAY_VERSION,
  pin: 'c0ffee',
  trainers: { player: 'Alice', opponent: 'Bob' },
  parties: { player: [], opponent: [] },
  blocks: [
    { name: 'b1', lines: [9], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [1] }] },
    { name: 'b2', lines: [12, 13], commands: [{ command: 'SC_MOVE_MSG', args: [2, 89] }] },
  ],
  fallbacks: [],
  dropped: [],
}

const named = (step: MacroStep) => ('name' in step ? `${step.kind} ${step.name}` : step.kind)

// Scene: a replay built for another format or on another pokebw2 must never reach the game.
describe('checkReplay', () => {
  it('takes a replay of its version on the numbers’ pin', () => {
    expect(() => {
      checkReplay(REPLAY, 'c0ffee')
    }).not.toThrow()
  })

  it('refuses a replay of version 1 by name', () => {
    expect(() => {
      checkReplay({ ...REPLAY, version: 1 }, 'c0ffee')
    }).toThrow('a Gen 5 replay of version 1; this plan reads version 2')
  })

  it('refuses a replay built on another pin by name', () => {
    expect(() => {
      checkReplay({ ...REPLAY, pin: 'beef01' }, 'c0ffee')
    }).toThrow('a replay built on pokebw2 beef01, the numbers are of c0ffee')
  })
})

// Scene: the client takes each block once it answered the one before.
describe('replaySteps', () => {
  it('writes each block, waits for its answer and marks it', () => {
    expect(replaySteps(REPLAY, SETUP).map(named)).toEqual([
      'write b1',
      'until b1',
      'mark b1-answered',
      'write b2',
      'until b2',
      'mark b2-answered',
    ])
  })

  it("puts each block's packed commands into the adapter and waits for `returned` 1", () => {
    const [write, until] = replaySteps(REPLAY, SETUP)
    if (write?.kind !== 'write') throw new Error('the first step is no write')
    expect(write.writes[0]).toEqual({
      kind: 'bytes',
      field: 'sendCmd.data',
      address: ADAPTER + 0x2c,
      bytes: [0x6a, 0x22, 0, 1],
    })
    expect(until).toMatchObject({
      checks: [{ address: ADAPTER + 0x20, width: 1, mask: 0x70, oneOf: [0x10] }],
    })
  })

  it('refuses an adapter whose `returned` does not sit in one byte', () => {
    const fields = { ...ADAPTER_LAYOUT.fields, returned: { offset: 0x20, size: 2 } }
    const wide = { ...ADAPTER_NUMBERS, layout: { ...ADAPTER_LAYOUT, fields } }
    expect(() => answered({ ...SETUP, adapterNumbers: wide })).toThrow(
      "the adapter's returned must sit in one byte",
    )
  })

  it('checks the replay before any write', () => {
    expect(() => replaySteps({ ...REPLAY, version: 1 }, SETUP)).toThrow('version 1')
  })
})
