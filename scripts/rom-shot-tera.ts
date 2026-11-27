// The first Terastallization (#89): the TERA op plays the charge, Terastallizes the mon and plays
// the activate, as BattleScript_Terastallization orders it (U/data/battle_scripts_1.s:46-57; U =
// .cache/rom/expansion at 79dd436). Between the two animations ApplyBattlerVisualsForTeraAnim
// redraws the mon's healthbox (U/src/battle_terastal.c:46-58), whose level slot now shows the Tera
// type's indicator instead of "Lv" (UpdateLvlInHealthbox, U/src/battle_interface.c:879-886).
import type { Stream } from '../src/gen3/stream/instructions.ts'

import { SCREEN } from './rom-shot-probes.ts'
import type { Scene } from './rom-shot-scenes.ts'

/**
 * The healthbox of the first Terastallized mon on the frame before TERA and on the frame after it.
 * A frame inside the op could show the charge, which hides both healthboxes for its whole length
 * (LaunchBattleAnimation, U/src/battle_anim.c:377-399), or the activate's white fade. The frame
 * after the op shows what lasts: the indicator in the healthbox of the side that Terastallized.
 */
export function teraScene(stream: Stream): Scene | undefined {
  const at = stream.instructions.findIndex((instruction) => instruction.op === 'tera')
  const tera = stream.instructions[at]
  if (tera?.op !== 'tera') return undefined
  const before = 'first-tera-before'
  const name = 'first-tera'
  return {
    name,
    shots: [
      { name: before, done: at, frames: 0 },
      { name, done: at + 1, frames: 0 },
    ],
    check: { probe: 'differs', before, after: name, region: SCREEN.healthbox[tera.side] },
  }
}
