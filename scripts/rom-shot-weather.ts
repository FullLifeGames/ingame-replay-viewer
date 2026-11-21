// The weather an ability starts (#22): Sand Stream, Drizzle or Drought sets the weather, prints its
// line and plays the weather's animation, as BattleScript_WeatherAbilityActivates orders it. The
// backend writes that as a WEATHER op, its PRINT and an ANIM op (src/gen3/translate/field.ts); a
// weather a move starts has none, since the move's own animation carries it.
import type { Instruction, Stream } from '../src/gen3/stream/instructions.ts'

import { SCREEN } from './rom-shot-probes.ts'
import type { Scene } from './rom-shot-scenes.ts'

// The sandstorm background blends in from the first frame of the animation over 28 frames (7
// steps of 4, AnimTask_LoadSandstormBackground_Step, U/src/battle_anim_rock.c:509-545; U =
// .cache/rom/expansion at 79dd436) and holds for 101 more; the sand crescents follow after
// `delay 16` (gBattleAnimMove_Sandstorm, U/data/battle_anim_scripts.s:24673-24678). Sixty frames
// in, the blend is full.
const WEATHER_FRAMES = 60

// The first ANIM op after a WEATHER op that starts a weather, with only PRINTs between them.
function weatherAnimAt(instructions: readonly Instruction[]): number {
  let started = false
  return instructions.findIndex((instruction) => {
    if (instruction.op === 'anim' && started) return true
    if (instruction.op !== 'print') {
      started = instruction.op === 'weather' && instruction.weather !== 'none'
    }
    return false
  })
}

/** The weather's animation against the frame before it, on the sky of the battle background. */
export function weatherScene(stream: Stream): Scene | undefined {
  const at = weatherAnimAt(stream.instructions)
  if (at < 0) return undefined
  const before = 'weather-start-before'
  const name = 'weather-start'
  return {
    name,
    shots: [
      { name: before, done: at, frames: 0 },
      { name, done: at, frames: WEATHER_FRAMES },
    ],
    check: { probe: 'differs', before, after: name, region: SCREEN.sky },
  }
}
