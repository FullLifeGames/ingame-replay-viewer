// The server's sequence of a faint (#108, lane plan D5), in the order pokebw2's
// src/battle/btl_server_flow.c puts it into the queue. The battle state marks the Pokémon fainted
// after the sequence (moves.ts). Pure: every number of the game comes in from
// build/gen5/bw2.json.
import type { FlowNumbers, TextNumbers } from '../bw2-numbers.ts'
import type { ServerCommand } from '../server-cmd.ts'
import type { BattleState } from './battle-state.ts'
import { GEN5_LINES, lineId } from './lines.ts'
import type { EventOf } from './rules.ts'

/** What the sequence takes: the battle state, the lines and the flow's numbers. */
export interface FaintScene {
  readonly state: BattleState
  readonly numbers: { readonly text: TextNumbers; readonly flow: FlowNumbers }
}

/**
 * The commands of a faint of a Pokémon in place:
 * - when the game still holds HP for it, as after Explosion or Destiny Bond:
 *   ServerDisplay_FaintPokemon's SC_OP_ZERO_HP and SC_FAINT_HP_GAUGE, with the flag that
 *   ServerControl_FaintPokemon passes;
 * - then ServerControl_CheckFainted's fainted line and SC_FAINT.
 * After a hit to 0 the hit's HP op took the HP already, so the faint starts at the line.
 * Throws by name when the game does not hold the Pokémon in place (lane plan D1).
 */
export function faintCommands(scene: FaintScene, event: EventOf<'faint'>): ServerCommand[] {
  const { state, numbers } = scene
  const { monId } = state.placed(event.who, event.line)
  const zero: ServerCommand[] =
    state.hpOf(event.who) === 0
      ? []
      : [
          { command: 'SC_OP_ZERO_HP', args: [monId] },
          { command: 'SC_FAINT_HP_GAUGE', args: [monId, numbers.flow.faintGaugeFlag] },
        ]
  const line = lineId(numbers.text, GEN5_LINES.fainted)
  return [
    ...zero,
    { command: 'SC_MSG_SET', message: line, args: [monId] },
    { command: 'SC_FAINT', args: [monId] },
  ]
}
