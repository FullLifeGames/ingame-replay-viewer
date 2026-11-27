import { describe, expect, it } from 'vitest'

import { buildBattleScript } from '../../script/build.ts'
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { PokemonRef } from '../../script/types.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import { writeScript } from './moves.ts'
import { gen5Move } from './names.ts'
import { buildGen5Replay } from './replay.ts'
import { REPLAY_NUMBERS as NUMBERS } from './replay.fixtures.ts'
import { SHOW_LINE } from './switches.ts'

// The invented battle of REPLAY_NUMBERS: Alice's client 3 holds Dugtrio, mon ID 40, at position
// 0; Bob's client 2 holds Tyranitar, mon ID 10, at position 1. Each side's Pokémon take the mon
// IDs of their party slots in the order they first show. Line NEXT is `|turn|1`. The log is a
// Gen 5 one, as Zoroark and its Illusion came with Gen 5.
const NEAR = { client: 3, pos: 0 }
const INTRO = [
  '|gen|5',
  '|player|p1|Alice|1|',
  '|player|p2|Bob|2|',
  '|teamsize|p1|6',
  '|teamsize|p2|6',
  '|start',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
]
const NEXT = INTRO.length

/** The battle script of Dugtrio against Tyranitar, `|turn|1`, then `lines`. */
const scriptOf = (...lines: string[]): BattleScript =>
  buildBattleScript(`${[...INTRO, '|turn|1', ...lines].join('\n')}\n`)

const cmd = (command: string, ...args: number[]): ServerCommand => ({ command, args })

/** ServerControl_CheckFainted: the set line, then SC_FAINT. */
const fainted = (monId: number): ServerCommand[] => [
  { command: 'SC_MSG_SET', message: lineId(NUMBERS.text, GEN5_LINES.fainted), args: [monId] },
  cmd('SC_FAINT', monId),
]

/** ServerDisplay_FaintPokemon: the HP to zero, then the faint gauge with the flag of
 * ServerControl_FaintPokemon. */
const zeroHp = (monId: number): ServerCommand[] => [
  cmd('SC_OP_ZERO_HP', monId),
  cmd('SC_FAINT_HP_GAUGE', monId, NUMBERS.flow.faintGaugeFlag),
]

/** ServerControl_SwitchInFillSlot after a faint, with the send-out line. */
const sendIn = (slot: number, turn: number) => [
  cmd('SC_OP_SETUP_ILLUSION', NEAR.client),
  cmd('SC_OP_SEND_IN', NEAR.client, 0, slot, turn),
  cmd('SC_SEND_OUT', NEAR.client, 0, slot, SHOW_LINE),
]

/** The commands that the script of `|turn|1` and `lines` writes for log line `NEXT + at`. */
function commandsAt(script: BattleScript, at: number): ServerCommand[] {
  const { actions } = writeScript(script, NUMBERS)
  return actions.flat().flatMap((event) => (event.line === NEXT + at ? event.commands : []))
}

const writtenAt = (at: number, ...lines: string[]) => commandsAt(scriptOf(...lines), at)

/** The fallbacks of the replay of `|turn|1` and `lines` whose event is of `kind`. */
const listedOf = (kind: ScriptEvent['kind'], ...lines: string[]) =>
  buildGen5Replay(scriptOf(...lines), NUMBERS).fallbacks.filter(
    (one) => 'event' in one && one.event === kind,
  )

const KNOCKED_OUT = [
  '|move|p2a: Tyranitar|Earthquake|p1a: Dugtrio',
  '|-damage|p1a: Dugtrio|0 fnt',
  '|faint|p1a: Dugtrio',
]

// Scene: Earthquake takes Dugtrio to 0, and the server's ServerControl_CheckFainted follows the
// hit: the fainted line and the faint, with no zero op, as the hit's HP op took the HP already.
describe('a faint after a hit to 0', () => {
  it('sends the fainted line and SC_FAINT, and lists nothing', () => {
    expect(writtenAt(3, ...KNOCKED_OUT)).toEqual(fainted(40))
    expect(listedOf('faint', ...KNOCKED_OUT)).toEqual([])
  })
})

// Scene: Dugtrio's Explosion leaves it with HP, and the log has `|faint|` alone, as after
// Destiny Bond: ServerControl_FaintPokemon takes the HP to zero first (lane plan D5).
describe('a faint with HP left', () => {
  const EXPLOSION = [
    '|move|p1a: Dugtrio|Explosion|p2a: Tyranitar',
    '|-damage|p2a: Tyranitar|30/100',
    '|faint|p1a: Dugtrio',
  ]
  const SEND_IN = ['|', '|upkeep', '|switch|p1a: Skarmory|Skarmory, M|100/100']

  it('zeroes the HP and the gauge, then sends the fainted line and SC_FAINT', () => {
    expect(writtenAt(3, ...EXPLOSION)).toEqual([...zeroHp(40), ...fainted(40)])
  })

  it('sends Skarmory into the empty place after it', () => {
    expect(writtenAt(6, ...EXPLOSION, ...SEND_IN)).toEqual(sendIn(1, 1))
  })

  // The script reads a fainted Pokémon sent in again as a new team member: a hand-cast line.
  it('refuses by name a later switch to the fainted Pokémon', () => {
    const script = scriptOf(
      ...EXPLOSION,
      ...SEND_IN,
      '|turn|2',
      '|switch|p1a: Gengar|Gengar, M|100/100',
    )
    const dugtrio: PokemonRef = { side: 'near', index: 0 }
    const events = script.events.map((event): ScriptEvent =>
      event.kind === 'switchIn' && event.line === NEXT + 8 ? { ...event, who: dugtrio } : event,
    )
    expect(() => writeScript({ ...script, events }, NUMBERS)).toThrow(
      new Error(`line ${String(NEXT + 8)}: the log sends in Dugtrio, which fainted`),
    )
  })
})

// Scene: Alice's Zoroark comes in disguised as Dugtrio, and Crunch ends the disguise. The game
// keeps Dugtrio's mon ID 40 in place, and Zoroark's later events play under it until Zoroark
// leaves (lane plan D8). The disguise's end waits for #109.
describe('a Pokémon under Illusion’s disguise', () => {
  const CRUNCH = ['|move|p2a: Tyranitar|Crunch|p1a: Dugtrio', '|-supereffective|p1a: Dugtrio']
  const REVEALED = [
    ...CRUNCH,
    '|-damage|p1a: Dugtrio|40/100',
    '|replace|p1a: Zoroark|Zoroark, M',
    '|-end|p1a: Zoroark|Illusion',
    '|turn|2',
  ]

  it('plays the real Pokémon’s move and hits under the disguise’s mon ID', () => {
    const lines = [
      ...REVEALED,
      '|move|p1a: Zoroark|Night Daze|p2a: Tyranitar',
      '|-damage|p2a: Tyranitar|50/100',
      '|move|p2a: Tyranitar|Earthquake|p1a: Zoroark',
      '|-damage|p1a: Zoroark|10/100',
    ]
    const script = scriptOf(...lines)
    expect(commandsAt(script, 7)).toEqual([
      cmd('SC_MOVE_MSG', 40, gen5Move('Night Daze')),
      cmd('SC_MOVE_ANIM', 0, 1, gen5Move('Night Daze'), 0),
    ])
    expect(commandsAt(script, 10)[0]).toEqual(cmd('SC_OP_SUBTRACT_HP', 40, 30))
  })

  it('lists the disguise’s end once, with #109', () => {
    expect(listedOf('replace', ...REVEALED)).toEqual([
      { line: NEXT + 4, kind: 'later', event: 'replace', detail: 'plays with #109' },
    ])
  })

  it('calls the disguise’s mon ID back when the real Pokémon leaves', () => {
    const lines = [...REVEALED, '|switch|p1a: Skarmory|Skarmory, M|100/100']
    expect(writtenAt(7, ...lines)).toEqual([
      cmd('SC_RECALL_MSG', NEAR.client, 40),
      cmd('SC_RECALL', NEAR.pos, NUMBERS.flow.switchEffects.switchOut),
      cmd('SC_OP_CLEAR_FOR_SWITCH', 40),
      ...sendIn(2, 2),
    ])
  })

  // A hand-cast line: the log ends a disguise that the game does not hold in place.
  it('refuses by name the end of a disguise off the front', () => {
    const script = scriptOf(...REVEALED)
    const zoroark: PokemonRef = { side: 'near', index: 1 }
    const events = script.events.map((event): ScriptEvent =>
      event.kind === 'replace' ? { ...event, replaces: zoroark } : event,
    )
    expect(() => writeScript({ ...script, events }, NUMBERS)).toThrow(
      new Error(
        `line ${String(NEXT + 4)}: the log ends the disguise of Zoroark; the game holds Dugtrio in place`,
      ),
    )
  })

  // The limit of the alias: the game marks the Pokémon in place fainted, so the disguise's own
  // Pokémon cannot come in after the real one fainted under it.
  it('faints under the disguise’s mon ID, and refuses the disguise’s Pokémon later by name', () => {
    const lines = [
      ...CRUNCH,
      '|-damage|p1a: Dugtrio|0 fnt',
      '|replace|p1a: Zoroark|Zoroark, M',
      '|-end|p1a: Zoroark|Illusion',
      '|faint|p1a: Zoroark',
      '|',
      '|upkeep',
      '|switch|p1a: Skarmory|Skarmory, M|100/100',
      '|turn|2',
      '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
    ]
    expect(writtenAt(6, ...lines.slice(0, -2))).toEqual(fainted(40))
    expect(() => writeScript(scriptOf(...lines), NUMBERS)).toThrow(
      new Error(`line ${String(NEXT + 11)}: the log sends in Dugtrio, which fainted`),
    )
  })
})
