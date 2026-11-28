// The Gen 3 game backend (plan §6): a battle script in, the instruction stream for the replay slot
// out, with the fallbacks it took and the battle script's dropped lines beside it.
import type { BattleScript } from '../script/events'
import type { DroppedLine } from '../script/types'
import { GenerationRefusal } from './errors'
import type { Fallback } from './fallbacks'
import { encodeStream } from './stream/encode'
import type { Placed } from './translate/context'
import { translate } from './translate'

/**
 * The generations the stream plays (#86, #87, #88, #125): Gen 7 and 8 bring Z-Moves and Dynamax,
 * which it lacks.
 */
export const PLAYED_GENS: readonly number[] = [1, 2, 3, 4, 5, 6, 9]

/** A run of generations from `first` to `last`, as the words name it. */
interface Run {
  readonly first: number
  last: number
}

/** `gens`, sorted, as runs of numbers that follow each other: [1, 2, 3, 9] as 1 to 3 and 9. */
function runsOf(gens: readonly number[]): Run[] {
  const runs: Run[] = []
  for (const gen of gens.toSorted((a, b) => a - b)) {
    const run = runs.at(-1)
    if (run?.last === gen - 1) run.last = gen
    else runs.push({ first: gen, last: gen })
  }
  return runs
}

const runText = ({ first, last }: Run): string =>
  first === last ? `Gen ${String(first)}` : `Gen ${String(first)} to ${String(last)}`

/** `gens` in words: "Gen 1 to 5 and Gen 9" for [1, 2, 3, 4, 5, 9], "Gen 3" for [3]. */
export const gensText = (gens: readonly number[]): string => runsOf(gens).map(runText).join(' and ')

/** The played generations in words, for the refusal and the pages. */
export const PLAYED_GENS_TEXT = gensText(PLAYED_GENS)

export interface Gen3Stream {
  /** The stream for the replay slot, starting with its version. */
  readonly bytes: Uint8Array
  /** The instructions with their log lines, text in Unicode. */
  readonly instructions: readonly Placed[]
  readonly fallbacks: readonly Fallback[]
  readonly dropped: readonly DroppedLine[]
}

export function buildGen3Stream(script: BattleScript): Gen3Stream {
  if (!PLAYED_GENS.includes(script.gen)) {
    throw new GenerationRefusal(script.gen, PLAYED_GENS_TEXT)
  }
  const { trainers, parties, instructions, fallbacks } = translate(script)
  const bytes = encodeStream({
    trainers,
    parties,
    instructions: instructions.map(({ instruction }) => instruction),
  })
  return { bytes, instructions, fallbacks, dropped: script.dropped }
}
