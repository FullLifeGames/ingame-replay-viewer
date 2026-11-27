import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vitest'

import type { AdapterNumbers } from '../src/gen5/adapter'
import { ADAPTER_LAYOUT } from '../src/gen5/adapter.fixtures'
import { GEN5_REPLAY_VERSION, type Gen5Replay } from '../src/gen5/backend/replay'
import { REPLAY_NUMBERS } from '../src/gen5/backend/replay.fixtures'
import type { Bw2Numbers } from '../src/gen5/bw2-numbers'
import type { MacroStep } from '../src/gen5/macro'
import { blockLines, blocksScene, sideOfMon } from './gen5-moment-blocks'
import { momentSteps } from './gen5-moment-plan'
import type { Battle } from './gen5-moment-read'

// Invented numbers: the adapter of src/gen5's fixtures, an adapter command, an address, and
// message IDs of a small bank of our own.
const ADAPTER_NUMBERS: AdapterNumbers = {
  layout: ADAPTER_LAYOUT,
  serverCmd: 0x0b,
  heldState: 2,
  queueSize: REPLAY_NUMBERS.queueSize,
}
const SETUP = {
  adapterNumbers: ADAPTER_NUMBERS,
  table: REPLAY_NUMBERS,
  adapter: 0x02134000,
  pin: 'c0ffee',
}
const TACKLE = 33
const FAR_MON = 7

const REPLAY: Gen5Replay = {
  version: GEN5_REPLAY_VERSION,
  pin: 'c0ffee',
  trainers: { player: 'Alice', opponent: 'Bob' },
  parties: { player: [], opponent: [] },
  blocks: [
    {
      name: 'b1',
      lines: [12, 13],
      commands: [
        { command: 'SC_MOVE_MSG', args: [FAR_MON, TACKLE] },
        { command: 'SC_DAMAGE_PLURAL', args: [1, 3, TACKLE], bytes: [5] },
        { command: 'SC_MSG_STD', message: 1, args: [] },
      ],
    },
    { name: 'b2', lines: [16], commands: [{ command: 'SC_MSG_SET', message: 0, args: [5] }] },
  ],
  fallbacks: [],
  dropped: [],
}

/** Invented text banks: two move lines, two standard lines and one set line. */
const BANKS = {
  move: [
    'Bank0016_Text_UsedTackle = {who} used Tackle!',
    'Bank0016_Text_FoesUsedTackle = The foe’s {who} used Tackle!',
  ].join('\n'),
  standard: 'Bank0019_Text_One = One.\nBank0019_Text_Two = It’s super effective!\n',
  set: 'Bank0018_Text_Avoided = {who} avoided the attack!\n',
}

const named = (step: MacroStep) => ('name' in step ? `${step.kind} ${step.name}` : step.kind)

// Scene: the scene runs of #107 and #108 hand a replay's blocks to the player's client once the
// player answered the action menu, as the moment does, and hold the last scene as a whole replay
// does (src/gen5/replay-plan.ts).
describe('blocksScene', () => {
  // Invented adapter command and state under their pokebw2 names, as ADAPTER_NUMBERS gives them.
  const numbers = {
    ...REPLAY_NUMBERS,
    adapterCommands: { BTL_ACMD_SERVER_CMD: ADAPTER_NUMBERS.serverCmd },
    adapterStates: { BTL_ADAPTER_STATE_IDLE: ADAPTER_NUMBERS.heldState },
  } as unknown as Bw2Numbers
  const party = (monId: number) => ({ mons: [{ monId }] })
  const battle = { adapter: SETUP.adapter, parties: { near: party(5), far: party(FAR_MON) } }
  const scene = (replay: Gen5Replay) =>
    blocksScene(replay, { numbers, battle: battle as unknown as Battle, banks: BANKS })

  it('holds and answers the menu as the moment does, writes each block, then holds the scene', () => {
    const { steps } = scene(REPLAY)
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
      'wait',
      'mark last-scene',
    ])
    const moment = momentSteps({ ...SETUP, blocks: [] })
    expect(steps.slice(0, 3)).toEqual(moment.slice(0, 3))
  })

  it('logs the block lines', () => {
    expect(scene(REPLAY).lines[0]).toBe('b1: lines 12, 13; 3 commands')
  })

  it('refuses a replay built on another pin, and one of another version', () => {
    expect(() => scene({ ...REPLAY, pin: 'beef01' })).toThrow(
      'a replay built on pokebw2 beef01, the numbers are of c0ffee',
    )
    expect(() => scene({ ...REPLAY, version: 1 })).toThrow('version 1')
  })

  it('refuses a run with no replay', () => {
    const input = { numbers: {} as Bw2Numbers, battle: {} as Battle, banks: BANKS }
    expect(() => blocksScene(undefined, input)).toThrow("a hand scene needs the replay's blocks")
  })
})

describe('blockLines', () => {
  const sideOf = (monId: number) => (monId === FAR_MON ? 'far' : 'near')

  it('logs each block by name, lines and commands, with the text of each line it shows', () => {
    expect(blockLines(REPLAY, { banks: BANKS, sideOf })).toEqual([
      'b1: lines 12, 13; 3 commands',
      'b1 SC_MOVE_MSG 7, 33; Bank0016_Text_FoesUsedTackle: The foe’s {who} used Tackle!',
      'b1 SC_DAMAGE_PLURAL 1, 3, 33; bytes 5',
      'b1 SC_MSG_STD; message 1: It’s super effective!',
      'b2: lines 16; 1 command',
      'b2 SC_MSG_SET 5; message 0: {who} avoided the attack!',
    ])
  })

  // Scene: the move bank spells some names apart from @pkmn by case, and names Follow Me in a
  // word of its own. The log finds the first by the rule and names the move it has no label for.
  it('finds a label that differs by case and names a move with no label', () => {
    const num = (name: string) => Dex.forGen(5).moves.get(name).num
    const moveMsg = (monId: number, move: string) => ({
      command: 'SC_MOVE_MSG',
      args: [monId, num(move)],
    })
    const commands = [moveMsg(FAR_MON, 'U-turn'), moveMsg(5, 'Solar Beam'), moveMsg(5, 'Follow Me')]
    const banks = {
      ...BANKS,
      move: 'Bank0016_Text_UsedSolarbeam = Beam.\nBank0016_Text_FoesUsedUTurn = Turn.\n',
    }
    const replay = { blocks: [{ name: 'b3', lines: [20], commands }] }
    expect(blockLines(replay, { banks, sideOf }).slice(1)).toEqual([
      `b3 SC_MOVE_MSG 7, ${String(num('U-turn'))}; Bank0016_Text_FoesUsedUTurn: Turn.`,
      `b3 SC_MOVE_MSG 5, ${String(num('Solar Beam'))}; Bank0016_Text_UsedSolarbeam: Beam.`,
      `b3 SC_MOVE_MSG 5, ${String(num('Follow Me'))}; no line label for Follow Me`,
    ])
  })
})

// Scene: in the switches scene (#108) a Pokémon other than the leads uses a move, and the log
// names its move line by its side, not by the lead's mon ID.
describe('sideOfMon', () => {
  const party = (...monIds: number[]) => ({ mons: monIds.map((monId) => ({ monId })) })
  const sideOf = sideOfMon({ near: party(4, 5, 6), far: party(FAR_MON, 8) })

  it('gives the side whose party holds the mon ID, the leads and the rest alike', () => {
    expect([4, 6, FAR_MON, 8].map(sideOf)).toEqual(['near', 'near', 'far', 'far'])
  })

  it('fails by name on a mon ID in neither party', () => {
    expect(() => sideOf(30)).toThrow('no party read at the action menu holds mon ID 30')
  })
})
