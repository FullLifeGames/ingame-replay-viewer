// The one dispatch from an effect's kind and cause to the module that copies its server function
// (#109, lane plan 109-5): status.ts, abilities.ts, stats.ts, field.ts, items.ts, substitute.ts
// and move-effects.ts each give their commands or undefined for a cause not their own. The
// abilities come before the stats: both write a drop with no cause, and only Intimidate's run adds
// the pop-up's end. An event that no module writes has no sequence, and the writer lists it as
// unplayed (D13, #110). Pure: every number of the game comes in from build/gen5/bw2.json.
import type { ScriptEvent } from '../../script/events.ts'
import type { ServerCommand } from '../server-cmd.ts'
import { ABILITY_SEQUENCES } from './abilities.ts'
import { type EffectScene, sequenceCommands, type Sequences } from './effect-scene.ts'
import { FIELD_SEQUENCES } from './field.ts'
import { ITEM_SEQUENCES } from './items.ts'
import { MOVE_EFFECT_SEQUENCES } from './move-effects.ts'
import { STAT_SEQUENCES } from './stats.ts'
import { STATUS_SEQUENCES } from './status.ts'
import { SUBSTITUTE_SEQUENCES } from './substitute.ts'

/** The effects' sequence records in the order the writer asks them. */
const EFFECT_SEQUENCES: readonly Sequences[] = [
  STATUS_SEQUENCES,
  ABILITY_SEQUENCES,
  STAT_SEQUENCES,
  FIELD_SEQUENCES,
  ITEM_SEQUENCES,
  SUBSTITUTE_SEQUENCES,
  MOVE_EFFECT_SEQUENCES,
]

/** The commands of the first record that writes `event`, or undefined where none does. */
export function effectCommands(
  scene: EffectScene,
  event: ScriptEvent,
): ServerCommand[] | undefined {
  for (const sequences of EFFECT_SEQUENCES) {
    const commands = sequenceCommands(sequences, scene, event)
    if (commands !== undefined) return commands
  }
  return undefined
}
