import { describe, expect, it } from 'vitest'

import { adapterNumbers } from './adapter.ts'
import { writtenMon } from './backend/party-mon.ts'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from './backend/replay.ts'
import { REPLAY_NUMBERS } from './backend/replay.fixtures.ts'
import { battleRefs } from './battle-check.ts'
import type { Bw2Numbers } from './bw2-numbers.ts'
import { ENTRY, ROUTINE } from './direct-entry.fixtures.ts'
import { GAUGE } from './hp-numbers.fixtures.ts'
import { type MacroStep, macroPlayer } from './macro.ts'
import { pkmFormat } from './pkm-members.ts'
import { BLOCK_LIMIT, replayEntry, replayPlan } from './replay-plan.ts'
import { entryRun, MOMENT_GAP, momentStart, playerAdapter, playRun } from './replay-run.ts'

// Invented numbers: two symbols, two adapter commands, an adapter state, the adapter's address
// in sAdapters and the frame of the mark battle. None comes from the game.
const ADAPTERS = 0x0213a5c0
const ADAPTER = 0x022f4100
const BATTLE_FRAME = 4321
const FORMAT = pkmFormat(REPLAY_NUMBERS)
const NUMBERS = {
  ...REPLAY_NUMBERS,
  // The entry's party layouts taken from the format's fixture, which the sealed Pokémon fit.
  entry: { ...ENTRY, layouts: { ...ENTRY.layouts, ...FORMAT.pkm.layouts } },
  symbols: {
    sAdapters: { name: 'sAdapters', kind: 'bss', address: ADAPTERS, module: 'ov1' },
    sCommMode: { name: 'sCommMode', kind: 'bss', address: 0x0213a5b8, module: 'ov1' },
  },
  adapterCommands: { BTL_ACMD_SELECT_ACTION: 0x2e, BTL_ACMD_SERVER_CMD: 0x31 },
  adapterStates: { BTL_ADAPTER_STATE_IDLE: 0x07 },
} as unknown as Bw2Numbers

const mon = (species: string, ability: string) =>
  writtenMon(
    {
      species,
      name: species,
      nicknamed: false,
      level: 50,
      gender: 'M',
      shiny: false,
      nature: 'Hardy',
      ability,
      moves: ['Tackle'],
    },
    { ot: { name: 'Ann', id: 0, gender: 0 }, salt: 0, format: FORMAT },
  )

const REPLAY: Gen5Replay = {
  version: GEN5_REPLAY_VERSION,
  pin: NUMBERS.pokebw2.commit,
  trainers: { player: 'Alice', opponent: 'Bob' },
  parties: { player: [mon('Oshawott', 'Torrent')], opponent: [mon('Oshawott', 'Torrent')] },
  blocks: [
    { name: 'b1', lines: [9], commands: [{ command: 'SC_UPDATE_HP_GAUGE', args: [1] }] },
    { name: 'b2', lines: [12, 13], commands: [{ command: 'SC_MOVE_MSG', args: [2, 89] }] },
  ],
  fallbacks: [],
  dropped: [],
}

/** A main RAM that holds the adapter's address in sAdapters and nothing else. */
const read32 = (address: number) => (address === ADAPTERS ? ADAPTER : 0)

const MARKS = [
  { name: 'takeover', frame: 120 },
  { name: 'battle', frame: BATTLE_FRAME - 50 },
  { name: 'battle-start', frame: BATTLE_FRAME - 10 },
  { name: 'battle', frame: BATTLE_FRAME },
]

/** The frame marks one `until` step gives while its checks never hold, to its limit. */
function frameMarks(step: MacroStep): string[] {
  const player = macroPlayer([step])
  const marks: string[] = []
  for (let frame = 0; frame < 4000; frame += 1) {
    const input = player.next(() => 0)
    marks.push(...input.marks)
    if (input.done) break
  }
  return marks
}

const untilOf = (steps: readonly MacroStep[], name: string) => {
  const step = steps.find((each) => each.kind === 'until' && each.name === name)
  if (step === undefined) throw new Error(`no until step ${name}`)
  return step
}

// Scene: the page starts the same direct entry as the run script, so a run on the page and a run
// of scripts/gen5-replay.ts reach the battle by the same steps.
describe('entryRun', () => {
  it("plays replayEntry's steps from boot with the battle's checks and watches", () => {
    const refs = battleRefs(NUMBERS)
    const entry = replayEntry(REPLAY, {
      entry: NUMBERS.entry,
      routine: ROUTINE,
      format: FORMAT,
      checks: refs.checks,
      pin: NUMBERS.pokebw2.commit,
      gauge: GAUGE,
    })
    const { plan, notes } = entryRun(REPLAY, NUMBERS, ROUTINE)
    expect(plan).toEqual({
      steps: entry.steps,
      startFrame: 0,
      watch: [...entry.watch, ...refs.watch],
      stateMarks: [],
    })
    expect(notes).toEqual(entry.notes)
  })
})

// Scene: the player's adapter is the word in sAdapters once the battle stands at the menu.
describe('playerAdapter', () => {
  it('reads the word at sAdapters', () => {
    expect(playerAdapter(NUMBERS, read32)).toBe(ADAPTER)
  })

  it('throws by name when bw2.json names no sAdapters', () => {
    const none = { ...NUMBERS, symbols: {} }
    expect(() => playerAdapter(none, read32)).toThrow('bw2.json names no sAdapters')
  })
})

// Scene: the page's play starts at the run script's frame, MOMENT_GAP after the entry's last mark
// battle, so the marks of both runs compare frame by frame.
describe('playRun', () => {
  it("starts MOMENT_GAP after the last mark battle with replayPlan's steps at the adapter", () => {
    const run = playRun(REPLAY, NUMBERS, { adapter: ADAPTER, marks: MARKS })
    const steps = replayPlan(REPLAY, {
      adapterNumbers: adapterNumbers(NUMBERS),
      table: NUMBERS,
      adapter: ADAPTER,
      pin: NUMBERS.pokebw2.commit,
      markEvery: BLOCK_LIMIT,
    })
    expect(run).toEqual({
      steps,
      startFrame: 0,
      startAt: BATTLE_FRAME + MOMENT_GAP,
      watch: battleRefs(NUMBERS).watch,
      stateMarks: [],
    })
    expect(momentStart(MARKS)).toBe(BATTLE_FRAME + MOMENT_GAP)
  })

  it('throws by name when the entry ended with no mark battle', () => {
    const marks = MARKS.filter((mark) => mark.name !== 'battle')
    expect(() => playRun(REPLAY, NUMBERS, { adapter: ADAPTER, marks })).toThrow(
      'the entry ended with no mark battle',
    )
  })

  it('marks only the first frame of a waiting block unless asked for more', () => {
    const run = playRun(REPLAY, NUMBERS, { adapter: ADAPTER, marks: MARKS })
    expect(frameMarks(untilOf(run.steps, 'b1'))).toEqual(['b1-001'])
  })

  it('marks a frame every `every` frames while a block waits when asked', () => {
    const run = playRun(REPLAY, NUMBERS, { adapter: ADAPTER, marks: MARKS, every: 1000 })
    expect(frameMarks(untilOf(run.steps, 'b2'))).toEqual(['b2-001', 'b2-002', 'b2-003'])
  })
})
