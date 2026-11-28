// The first Mega Evolution (#126): the MEGA_EVOLVE op sets the gimmick and plays the Mega Evolution
// animation between the stone's line and the evolved line, as BattleScript_MegaEvolution orders it
// (U/data/battle_scripts_1.s:3897-3910; U = .cache/rom/expansion at 79dd436). The animation's
// AnimTask_HideSwapSprite swaps the mon's sprite for the Mega's mid-way
// (U/src/battle_anim_effects_3.c:2330-2350), and the healthbox redraw after it puts the Mega mark in
// place of "Lv" (UpdateLvlInHealthbox, U/src/battle_interface.c:875-896).
import type { Stream } from '../src/gen3/stream/instructions.ts'
import type { Side } from '../src/script/types.ts'

import { SCREEN } from './rom-shot-probes.ts'
import type { Region } from './rom-shot-probes.ts'
import type { Scene } from './rom-shot-scenes.ts'

function firstMega(stream: Stream): { at: number; side: Side } | undefined {
  const at = stream.instructions.findIndex((instruction) => instruction.op === 'megaEvolve')
  const mega = stream.instructions[at]
  return mega?.op === 'megaEvolve' ? { at, side: mega.side } : undefined
}

// The frame before MEGA_EVOLVE and the second frame after it. A frame inside the op could show the
// animation, which hides both healthboxes for its whole length (LaunchBattleAnimation,
// U/src/battle_anim.c:387, shown again at :1080). On the first frame after the op the healthbox
// redraw is still under way while the screen is drawn: mGBA's frame of both Gen 6 picks lacks
// the name or the level's first digit. The next frame shows what lasts.
const SETTLED = 1

function megaCheck(stream: Stream, name: string, region: (side: Side) => Region) {
  const mega = firstMega(stream)
  if (mega === undefined) return undefined
  const before = `${name}-before`
  return {
    name,
    shots: [
      { name: before, done: mega.at, frames: 0 },
      { name, done: mega.at + 1, frames: SETTLED },
    ],
    check: { probe: 'differs', before, after: name, region: region(mega.side) },
  } satisfies Scene
}

/** The healthbox of the first Mega: the Mega mark in place of "Lv" after the op. */
export function megaScene(stream: Stream): Scene | undefined {
  return megaCheck(stream, 'first-mega', (side) => SCREEN.healthbox[side])
}

/** The sprite of the first Mega: the Mega's sprite in place of its base form's after the op. */
export function megaSpriteScene(stream: Stream): Scene | undefined {
  return megaCheck(stream, 'first-mega-sprite', (side) => SCREEN.mon[side])
}
