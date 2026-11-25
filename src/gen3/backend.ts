// The Gen 3 game backend (plan §6): a battle script in, the instruction stream for the replay slot
// out, with the fallbacks it took and the battle script's dropped lines beside it.
import type { BattleScript } from '../script/events'
import type { DroppedLine } from '../script/types'
import { GenerationRefusal } from './errors'
import type { Fallback } from './fallbacks'
import { encodeStream } from './stream/encode'
import type { Placed } from './translate/context'
import { translate } from './translate'

/** The newest generation the stream plays (#86, #87). */
export const NEWEST_GEN = 5

export interface Gen3Stream {
  /** The stream for the replay slot, starting with its version. */
  readonly bytes: Uint8Array
  /** The instructions with their log lines, text in Unicode. */
  readonly instructions: readonly Placed[]
  readonly fallbacks: readonly Fallback[]
  readonly dropped: readonly DroppedLine[]
}

export function buildGen3Stream(script: BattleScript): Gen3Stream {
  if (script.gen > NEWEST_GEN) {
    throw new GenerationRefusal(script.gen, NEWEST_GEN)
  }
  const { trainers, parties, instructions, fallbacks } = translate(script)
  const bytes = encodeStream({
    trainers,
    parties,
    instructions: instructions.map(({ instruction }) => instruction),
  })
  return { bytes, instructions, fallbacks, dropped: script.dropped }
}
