// The Gen 5 page's sentences about the test replay it plays (#111): the load, each block, the
// battle's end at the last scene (lane plan D11), a stop with the block and its log lines, and the
// refusals of a run queued from outside (D14), a save (D15) and a bad frame count. Each is pinned
// whole in replay-words.test.ts.
import type { ReplayEnd } from '../../gen5/backend/end.ts'
import type { Gen5Block } from '../../gen5/backend/replay.ts'
import { lineNumber } from '../../script/lines.ts'

export const OUTSIDE_RUN = 'A run is already queued, so the page plays no replay.'

export const SAVE_REFUSED =
  'A replay plays from power-on with no save. Remove ?save= from the address to play one.'

export const loadingLine = (label: string) => `Loading ${label}.`

/** The block in hand of `blocks`, or the wait at the first menu before the first block. */
export function playingLine(label: string, block: number, blocks: number): string {
  if (block === 0) return `${label}: waiting at the first action menu.`
  return `${label}: block ${String(block)} of ${String(blocks)}.`
}

function resultLine({ result }: ReplayEnd): string {
  if (result === undefined) return 'The log names no winner.'
  return result.kind === 'tie' ? 'The battle ended in a tie.' : `${result.name} won.`
}

/** Who won, the simulator's messages after the last turn, and the last scene the game holds. */
export function endLine(end: ReplayEnd): string {
  const messages = end.messages.map(({ text }) => text)
  return [resultLine(end), ...messages, 'Black 2 holds the last scene.'].join(' ')
}

/** Where the play stopped: the block with its log lines counted from 1, when the stop was in
 * one, and the hook's reason. */
export function stoppedLine(
  block: Pick<Gen5Block, 'name' | 'lines'> | undefined,
  failed: string,
): string {
  if (block === undefined) return `The replay stopped: ${failed}`
  const numbers = block.lines.map((line) => String(lineNumber(line)))
  const lines = `${numbers.length === 1 ? 'line' : 'lines'} ${numbers.join(', ')}`
  return `The replay stopped at ${block.name} (${lines}): ${failed}`
}

export const entryFailedLine = (failed: string) => `Black 2 did not reach the battle: ${failed}`

export const loadFailedLine = (label: string, message: string) =>
  `The page could not build ${label}: ${message}`

export const everyRefused = (value: string) =>
  `The address asks for a frame every "${value}" frames, which is no whole number above 0, so the page does not start the game.`
