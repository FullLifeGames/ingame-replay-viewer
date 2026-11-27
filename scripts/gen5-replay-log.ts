// The log lines of a whole replay's run (#110): a line per block with its answer's frame, the
// frames it took against its limit and the battle log lines it showed; the battle's end; the
// not-shown list; and the run's summary. Pure: scripts/gen5-replay.ts prints the lines.
import type { ReplayEnd } from '../src/gen5/backend/end.ts'
import type { NotShown } from '../src/gen5/backend/not-shown.ts'
import type { Gen5Block } from '../src/gen5/backend/replay.ts'
import type { MarkRecord } from '../src/gen5/hook.ts'
import { BLOCK_LIMIT } from '../src/gen5/replay-plan.ts'

type Block = Pick<Gen5Block, 'name' | 'lines'>
type Mark = Pick<MarkRecord, 'name' | 'frame'>

/** A block's answer: its mark's frame, and the frames since the mark before it (the block
 * before's answer, or `hp-before` for the first block), when both marks exist. */
interface Answer {
  block: Block
  frame: number | undefined
  frames: number | undefined
}

const frameOf = (marks: readonly Mark[], name: string) =>
  marks.findLast((mark) => mark.name === name)?.frame

function answersOf(blocks: readonly Block[], marks: readonly Mark[]): Answer[] {
  return blocks.map((block, i) => {
    const frame = frameOf(marks, `${block.name}-answered`)
    const before = i === 0 ? 'hp-before' : `${blocks[i - 1]?.name ?? ''}-answered`
    const since = frameOf(marks, before)
    const frames = frame === undefined || since === undefined ? undefined : frame - since
    return { block, frame, frames }
  })
}

/** One line per block: its answer's frame and its frames of the limit, or no answer mark, then
 * its lines by number and text. */
export function blockReport(
  blocks: readonly Block[],
  marks: readonly Mark[],
  lines: readonly string[],
): string[] {
  return answersOf(blocks, marks).map(({ block, frame, frames }) => {
    const took = frames === undefined ? '' : `, ${String(frames)} frames of ${String(BLOCK_LIMIT)}`
    const answer =
      frame === undefined ? 'no answer mark' : `answered at frame ${String(frame)}${took}`
    const shown = block.lines.map((line) => lines[line] ?? `(no log line ${String(line)})`)
    return `${block.name}: ${answer}; lines ${block.lines.join(', ')}: ${shown.join(' / ')}`
  })
}

/** The battle's result, then each message after the last turn, which the game does not show. */
export function endLines(end: ReplayEnd): string[] {
  const { result } = end
  const messages = end.messages.map(
    ({ line, text }) => `end: not in the game: "${text}" (line ${String(line)})`,
  )
  if (result === undefined) return ['end: the log names no winner', ...messages]
  const at = `line ${String(result.line)}`
  if (result.kind === 'tie') return [`end: a tie (${at})`, ...messages]
  const side = result.side === undefined ? '' : `the ${result.side} side, `
  return [`end: ${result.name} won (${side}${at})`, ...messages]
}

/** A line per issue or kind of the not-shown list, each event kind with its count. */
export function notShownLines(list: NotShown): string[] {
  const groups = Object.entries(list)
  if (groups.length === 0) return ['not shown: nothing']
  return groups.map(([by, kinds]) => {
    const counted = Object.entries(kinds).map(([kind, count]) => `${kind} ${String(count)}`)
    return `not shown, ${by}: ${counted.join(', ')}`
  })
}

/** The run's summary: the blocks answered, the longest block against its limit, the frames from
 * `hp-before` to `last-scene` and the wall time. */
export function runSummary(blocks: readonly Block[], marks: readonly Mark[], wallMs: number) {
  const answers = answersOf(blocks, marks)
  const answered = answers.filter((one) => one.frame !== undefined).length
  const longest = answers.reduce<Answer | undefined>(
    (most, one) => ((one.frames ?? -1) > (most?.frames ?? -1) ? one : most),
    undefined,
  )
  const longestText =
    longest?.frames === undefined
      ? 'no block answered'
      : `longest ${longest.block.name}, ${String(longest.frames)} frames of ${String(BLOCK_LIMIT)}`
  const from = frameOf(marks, 'hp-before')
  const to = frameOf(marks, 'last-scene')
  const play = from === undefined || to === undefined ? 'no' : String(to - from)
  const wall = (wallMs / 60_000).toFixed(1)
  const count = `${String(answered)} of ${String(blocks.length)} blocks answered`
  return `run: ${count}; ${longestText}; ${play} frames from hp-before to last-scene; wall ${wall} min`
}
