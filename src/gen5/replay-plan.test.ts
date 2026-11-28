import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from './adapter.ts'
import { ADAPTER_LAYOUT } from './adapter.fixtures.ts'
import { sealParties, writtenMon } from './backend/party-mon.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import { REPLAY_NUMBERS } from './backend/replay.fixtures.ts'
import { directEntry } from './direct-entry.ts'
import { ENTRY, ROUTINE } from './direct-entry.fixtures.ts'
import type { MacroStep } from './macro.ts'
import { pkmFormat } from './pkm-members.ts'
import { writesAfterHold } from './plan-writes.ts'
import type { RamCheck } from './ram-check.ts'
import { answered, checkReplay, replayEntry, replayPlan, replaySteps } from './replay-plan.ts'

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
    }).toThrow('a Gen 5 replay of version 1; this plan reads version 3')
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

// Scene: a block that the backend packed past the client's queue must name itself, so the run's
// log points at the battle log lines whose commands overflowed, not at a byte count alone.
describe('a block wider than the queue', () => {
  const narrow = { ...SETUP, adapterNumbers: { ...ADAPTER_NUMBERS, queueSize: 0x18 } }
  const commands = Array.from({ length: 5 }, () => ({ command: 'SC_MOVE_MSG', args: [2, 89] }))
  const wide: Gen5Replay = { ...REPLAY, blocks: [{ name: 'b2', lines: [12, 13], commands }] }

  it('fails by its name and lines, with the room check as the cause', () => {
    const named = "b2 (lines 12, 13): The block has 30 bytes; the client's queue holds 24."
    expect(() => replaySteps(wide, narrow)).toThrow(named)
    expect(() => replaySteps(wide, narrow)).toThrow(
      expect.objectContaining({ cause: expect.any(RangeError) as unknown }),
    )
  })
})

const THREE: Gen5Replay = {
  ...REPLAY,
  blocks: [
    ...REPLAY.blocks,
    { name: 'b3', lines: [15], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [2] }] },
  ],
}

// Scene: a whole replay plays from the action menu to its last block, one block at a time, each
// once the client answered the one before; after the last block the game holds the last scene.
describe('replayPlan', () => {
  const plan = replayPlan(THREE, { ...SETUP, markEvery: 30 })

  it('answers the menu, writes and waits once per block in order, then holds the last scene', () => {
    const blocks = ['b1', 'b2', 'b3'].flatMap((b) => [
      `write ${b}`,
      `until ${b}`,
      `mark ${b}-answered`,
    ])
    expect(plan.map(named)).toEqual([
      'write hold',
      'until answer-menu',
      'mark hp-before',
      ...blocks,
      'mark end',
      'wait',
      'mark last-scene',
    ])
  })

  it('waits for each answer within the block limit, a frame every markEvery frames', () => {
    const waits = plan.filter((step) => step.kind === 'until' && step.name.startsWith('b'))
    expect(waits).toHaveLength(3)
    for (const wait of waits) expect(wait).toMatchObject({ holdFor: 1, limit: 3000, markEvery: 30 })
    const plain = replayPlan(THREE, SETUP).find(
      (step) => step.kind === 'until' && step.name === 'b1',
    )
    expect(plain).toMatchObject({ markEvery: 10 })
  })

  it('writes nothing after the last block, and holds 300 frames', () => {
    const last = plan.findIndex((step) => step.kind === 'mark' && step.name === 'b3-answered')
    expect(plan.slice(last).filter((step) => step.kind === 'write')).toEqual([])
    expect(plan.at(-2)).toEqual({ kind: 'wait', frames: 300 })
  })

  it('checks the replay before any step', () => {
    expect(() => replayPlan({ ...THREE, pin: 'beef01' }, SETUP)).toThrow('pokebw2 beef01')
  })
})

// Scene: the client never starts an action selection during a replay, so no trainer's hint line
// shows (CheckTrainerHintMsg in pokebw2's btl_client.c): after the hold every adapter command is
// the server command and every state the held one.
describe('replayPlan after the hold', () => {
  it('asks no action of the player', () => {
    const { commands, states } = writesAfterHold(replayPlan(THREE, SETUP))
    expect(commands).toEqual([ADAPTER_NUMBERS.serverCmd])
    expect(states).toEqual([ADAPTER_NUMBERS.heldState])
  })

  it('refuses to read a plan with no hold', () => {
    expect(() => writesAfterHold(replaySteps(THREE, SETUP))).toThrow('it has no write hold')
  })
})

// Scene: the page starts a replay from power-on; the direct entry writes the replay's own parties
// and trainer names, and a replay of another version or pin never gets a step.
describe('replayEntry', () => {
  const format = pkmFormat(REPLAY_NUMBERS)
  const ot = { name: 'Ann', id: 0, gender: 0 }
  const mon = {
    species: 'Oshawott',
    name: 'Oshawott',
    nicknamed: false,
    level: 50,
    gender: 'M',
    shiny: false,
    nature: 'Hardy',
    ability: 'Torrent',
    moves: ['Tackle'],
  } as const
  const written = writtenMon(mon, { ot, salt: 0, format })
  const replay: Gen5Replay = { ...REPLAY, parties: { player: [written], opponent: [written] } }
  const checks: RamCheck[] = [{ name: 'adapter', address: 0x02150000, width: 4 }]
  // The entry's party layouts taken from the format's fixture, which the sealed Pokémon fit.
  const entry = { ...ENTRY, layouts: { ...ENTRY.layouts, ...format.pkm.layouts } }
  const sealed = sealParties(replay.parties, format)
  const input = { entry, routine: ROUTINE, format, checks, pin: 'c0ffee' }

  it('writes the sealed parties and both names as the direct entry does', () => {
    const sides = { names: replay.trainers, parties: sealed.parties, style: 'single' } as const
    const direct = directEntry(entry, ROUTINE, sides, checks)
    const planned = replayEntry(replay, input)
    expect(planned.steps).toEqual(direct.steps)
    expect(planned.watch).toEqual(direct.watch)
    expect(planned.notes).toEqual([...sealed.notes, ...direct.notes])
  })

  it('refuses another version or pin before any step', () => {
    expect(() => replayEntry({ ...replay, version: 1 }, input)).toThrow('version 1')
    expect(() => replayEntry({ ...replay, pin: 'beef01' }, input)).toThrow('pokebw2 beef01')
  })
})
