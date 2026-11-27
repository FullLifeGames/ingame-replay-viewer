// Helpers for the specs of the effects' sequences (#109): a short Gen 5 log of Alice's Dugtrio
// against Bob's Tyranitar, and the commands a module's sequences write for each of its events on
// REPLAY_NUMBERS, with the battle state following the switch-ins and faints as the writer does.
import { buildBattleScript } from '../../script/build.ts'
import type { BattleScript, ScriptEvent } from '../../script/events.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { type BattleState, battleState } from './battle-state.ts'
import { actionsOf } from './blocks.ts'
import { type EffectScene, sequenceCommands, type Sequences } from './effect-scene.ts'
import { REPLAY_NUMBERS } from './replay.fixtures.ts'
import { afterLeads } from './rules.ts'

const INTRO = [
  '|gen|5',
  '|player|p1|Alice|1|',
  '|player|p2|Bob|2|',
  '|teamsize|p1|6',
  '|teamsize|p2|6',
  '|start',
  '|switch|p1a: Dugtrio|Dugtrio, M|100/100',
  '|switch|p2a: Tyranitar|Tyranitar, M|100/100',
  '|turn|1',
]

/** The index of the first line after `|turn|1`. */
const FIRST = INTRO.length

/** In REPLAY_NUMBERS' battle, Alice's client 3 holds Dugtrio, mon ID 40, at position 0, and Bob's
 * client 2 holds Tyranitar, mon ID 10, at position 1; each side's next Pokémon takes the next mon
 * ID. */
export const NEAR = { client: 3, pos: 0, firstMonId: 40 }
export const FAR = { client: 2, pos: 1, firstMonId: 10 }

/** The battle script of the leads, `|turn|1`, then `lines`. */
export const effectScript = (...lines: string[]): BattleScript =>
  buildBattleScript(`${[...INTRO, ...lines].join('\n')}\n`)

/** What a module's sequences write for one event after `|turn|1`: its line counted from the
 * first line after it, and the commands, or undefined where they have no sequence. */
export interface EffectWrite {
  readonly at: number
  readonly commands: ServerCommand[] | undefined
}

/** The game's HP follows an HP change that no sequence writes, as the writer's silent bar does
 * (hits.ts), so the next sequence starts from the logged HP. */
function followHp(state: BattleState, event: ScriptEvent): void {
  const hp = event.kind === 'damage' || event.kind === 'heal' || event.kind === 'setHp'
  if (hp && state.inPlace(event.who) !== undefined) state.hpTo(event.who, event.hp)
}

/** The commands `sequences` write for each event of `lines` after `|turn|1`. */
export function effectWrites(sequences: Sequences, ...lines: string[]): EffectWrite[] {
  const script = effectScript(...lines)
  const state = battleState(script, REPLAY_NUMBERS.battle)
  const after = afterLeads(script.events)
  const writes: EffectWrite[] = []
  for (const action of actionsOf(script)) {
    for (const [index, event] of action.entries()) {
      const at = script.events.indexOf(event)
      const scene: EffectScene = {
        state,
        numbers: REPLAY_NUMBERS,
        action,
        index,
        events: script.events,
        at,
      }
      const commands = sequenceCommands(sequences, scene, event)
      if (commands === undefined) followHp(state, event)
      if (event.line >= FIRST) writes.push({ at: event.line - FIRST, commands })
      if (event.kind === 'switchIn' && after[at] === true) state.sendIn(event)
      if (event.kind === 'faint') state.faint(event.who)
    }
  }
  return writes
}

/** The commands `sequences` write for the event of line `at` after `|turn|1`. */
export function writtenAt(writes: readonly EffectWrite[], at: number): ServerCommand[] | undefined {
  const write = writes.find((one) => one.at === at)
  if (write === undefined) throw new Error(`no event at line ${String(at)} after the turn`)
  return write.commands
}

/** The number `key` of a table of REPLAY_NUMBERS; throws where the fixture lacks it. */
export function numberOf(table: Readonly<Record<string, number>>, key: string): number {
  const value = table[key]
  if (value === undefined) throw new Error(`REPLAY_NUMBERS has no ${key}`)
  return value
}

/** The battle's constant `name` in REPLAY_NUMBERS. */
export const constant = (name: string): number => numberOf(REPLAY_NUMBERS.battle.constants, name)

/** A command of the given name and arguments. */
export const cmd = (command: string, ...args: number[]): ServerCommand => ({ command, args })
