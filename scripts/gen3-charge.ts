// The charge turns of the two-turn moves (#65), from the pinned `gMovesInfo`
// (src/data/moves_info.h): the line each says, `.argument.twoTurnAttack.stringId`, whether it
// plays its animation before that line, and whether it hides its user until the hit, which a
// semi-invulnerable `.state` (`enum SemiInvulnerableState`, include/constants/battle.h) marks. `Cmd_twoturnmoveschargestringandanimation`
// (src/battle_script_commands.c) takes the animation first for a move with an effect on its
// charge turn only (`MoveHasChargeTurnAdditionalEffect`, `.onChargeTurnOnly`); the macro of the
// same name (asm/macros/battle_script.inc) plays the line first otherwise.
//
// The reader takes every branch of an `#if` inside an entry. Skull Bash sets `.onChargeTurnOnly`
// under `B_UPDATED_MOVE_DATA >= GEN_2`, which holds for the pinned config's `GEN_LATEST`.
//
// Sky Drop's state also hides its target; the viewer meets Sky Drop with Gen 5 at the earliest.
import { parseEntryValues } from './gen3-parse.ts'

export const MOVES_INFO = 'src/data/moves_info.h'

const TWO_TURN = /\.argument\.twoTurnAttack\s*=\s*\{([^}]*)\}/
const STRING_ID = /\.stringId\s*=\s*(STRINGID_\w+)/
const CHARGE_TURN_ONLY = /\.onChargeTurnOnly\s*=\s*TRUE\b/
const STATE = /\.state\s*=\s*(STATE_\w+)/

interface ChargeTurn {
  readonly stringId: string
  readonly animationFirst: boolean
  readonly semiInvulnerable: boolean
}

/** The charge turn of each move with `twoTurnAttack`, by its constant. */
export function chargeTurns(text: string): Record<string, ChargeTurn> {
  const turns: Record<string, ChargeTurn> = {}
  for (const [constant, value] of parseEntryValues(text, 'MOVE')) {
    const twoTurn = TWO_TURN.exec(value)
    if (twoTurn === null) continue
    const stringId = STRING_ID.exec(twoTurn[1] ?? '')?.[1]
    if (stringId === undefined) throw new Error(`${constant}: twoTurnAttack names no stringId`)
    const state = STATE.exec(twoTurn[1] ?? '')?.[1] ?? 'STATE_NONE'
    turns[constant] = {
      stringId,
      animationFirst: CHARGE_TURN_ONLY.test(value),
      semiInvulnerable: state !== 'STATE_NONE',
    }
  }
  return turns
}
