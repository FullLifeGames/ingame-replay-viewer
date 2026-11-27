// The steps of the S6 run of the Gen 5 spike (#72): from the battle state, hold the server, let
// the player answer the action menu, then hand the player's client one block per moment, each
// once it answered the one before (src/gen5/replay-plan.ts, which holds the menu's steps too). No
// write after the hold asks for the player's action: the client then starts no action selection,
// and no trainer's hint line shows (#76, CheckTrainerHintMsg). The page plays the steps frame by
// frame (src/web/gen5/frame-hook.ts); scripts/gen5-moment.ts reads the addresses and the Pokémon
// from RAM first.
import type { MacroStep } from '../src/gen5/macro.ts'
import { momentCommands, type Moment } from '../src/gen5/moment.ts'
import { type BlockSetup, blockSteps, menuSteps } from '../src/gen5/replay-plan.ts'

/** Frames from the session's mark `battle` to the moment's start: room for the script's reading
 * of the battle. E-5's runs queued the moment about 35 frames after the mark on the build machine;
 * ten seconds at the DS's pace leave room for a faster core. */
export const MOMENT_GAP = 600

export interface MomentSetup extends BlockSetup {
  blocks: { name: string; moment: Moment }[]
}

/** The frame the moment's plan starts at: MOMENT_GAP frames after the session's mark `battle`,
 * or undefined for a session with no such mark. */
export function momentStart(marks: readonly { name: string; frame: number }[]): number | undefined {
  const battle = marks.findLast((mark) => mark.name === 'battle')
  return battle === undefined ? undefined : battle.frame + MOMENT_GAP
}

export function momentSteps(setup: MomentSetup): MacroStep[] {
  return [
    ...menuSteps(setup),
    ...setup.blocks.flatMap(({ name, moment }) =>
      blockSteps(setup, { name, commands: momentCommands(moment) }),
    ),
    { kind: 'mark', name: 'end' },
  ]
}
