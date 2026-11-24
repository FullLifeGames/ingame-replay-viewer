// The per-op frame log (#71): `node scripts/op-frames.ts [--threshold <n>] <stream>...` compares
// the frames at which each op of a stream starts in mGBA (build/rom/shots/<stream>/, from
// `npm run rom:shots`) and in the module (build/wasm/run/<stream>/, from `npm run wasm:run`), and
// names the first op where the two part by more than the threshold.
//
// An op starts on the frame the interpreter takes it from the stream: the first frame on which it
// plays with gReplayProgress.done at the op's index (Replay_RunBattle in
// rom/gen3/src/replay_interpreter.c moves to the next op in the frame it counts the last one done).
// Both engines read done after each frame, the shot tool through mGBA's bus and wasm:run from the
// module's memory, and write that frame per op; the frame on which done reaches the op count is
// END's finish. The span from one op's start to the next holds the wait for the earlier ops'
// controllers, text and KO animations and the op's own steps.
//
// The compare counts each start from op 0's start, so the engines' boot, which takes mGBA 16 to 22
// frames longer, parts nothing.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { OP } from '../src/gen3/stream/format.ts'
import { runCli } from './rom-cli.ts'
import { buildPaths, REPO_DIR } from './rom-paths.ts'
import { wasmPaths } from './wasm-compile.ts'

const VERSION = 1
const MAGIC = 'op-frames'
/** The log's file name in a run's folder of frames. */
export const OP_FRAMES_FILE = 'op-frames.txt'
const FINISHED = 'finished'

/**
 * Frames by which a start, counted from op 0, may part before the compare names the op. On
 * hand-made and 993907 the gap steps by 1 frame at 20 ops and by 3 at two moves, and by 13 to 40
 * frames at near send-outs, whose back animation follows the mon's nature (#71). Three keeps the
 * small steps out and names the first large one.
 */
export const DEFAULT_THRESHOLD = 3

/** One op start as the shot tool and wasm:run's --play process print it: {"op":i,"frame":f}. */
export interface OpStart {
  op: number
  frame: number
}

interface OpRow {
  index: number
  op: string
  frame: number
}

export interface OpFrameLog {
  engine: string
  stream: string
  rows: OpRow[]
  /** The frame on which done reached the op count: END's finish. */
  finished?: number
}

type Pair = [number, number]

interface Step {
  index: number
  /** The op whose span ends at this start: the op before it. */
  span: string
  by: number
}

interface Parting extends OpRow {
  frames: Pair
  gap: number
  span: string
}

interface Compared {
  start?: Pair
  parting?: Parting
  finished?: Pair
  steps: Step[]
}

export type OpFramesVerdict = { problem: string } | Compared

/** The rule of both engines' op starts; replay_shot.c's LogOps keeps the same rule in C. */
export class OpClock {
  readonly starts: OpStart[] = []
  private next = 0

  note(progress: { done: number; playing: boolean }, frame: number): void {
    if (!progress.playing) return
    for (; this.next <= progress.done; this.next++) this.starts.push({ op: this.next, frame })
  }
}

/** The log of one run: each start named by the stream's op at its index. */
export function opFrameLog(
  head: { engine: string; stream: string },
  starts: readonly OpStart[],
  ops: readonly string[],
): OpFrameLog {
  const log: OpFrameLog = { ...head, rows: [] }
  for (const { op: index, frame } of starts) {
    const op = ops[index]
    if (op !== undefined) log.rows.push({ index, op, frame })
    else if (index === ops.length) log.finished = frame
    else
      throw new Error(
        `op ${String(index)} started, the stream ${head.stream} has ${String(ops.length)}`,
      )
  }
  return log
}

export function formatOpFrames(log: OpFrameLog): string {
  const rows = log.rows.map((row) => `${String(row.index)} ${row.op} ${String(row.frame)}`)
  const finished = log.finished === undefined ? [] : [`${FINISHED} ${String(log.finished)}`]
  return [`${MAGIC} ${String(VERSION)} ${log.engine} ${log.stream}`, ...rows, ...finished, ''].join(
    '\n',
  )
}

function parseHeader(line: string): { engine: string; stream: string } {
  const match = new RegExp(`^${MAGIC} (\\d+) (\\S+) (\\S+)$`).exec(line)
  if (match === null) throw new Error(`"${line}" is no op frame log header`)
  const [, version, engine, stream] = match as unknown as [string, string, string, string]
  if (Number(version) !== VERSION) {
    throw new Error(
      `an op frame log of version ${version}; this compare reads version ${String(VERSION)}`,
    )
  }
  return { engine, stream }
}

function parseRow(log: OpFrameLog, line: string, number: number): void {
  const finished = new RegExp(`^${FINISHED} (\\d+)$`).exec(line)
  const row = /^(\d+) (\w+) (\d+)$/.exec(line)
  if (finished !== null && log.finished === undefined) log.finished = Number(finished[1])
  else if (row !== null && log.finished === undefined) {
    const index = Number(row[1])
    if (index !== log.rows.length) {
      throw new Error(
        `line ${String(number)}: op ${String(index)}, expected op ${String(log.rows.length)}`,
      )
    }
    log.rows.push({ index, op: row[2] as string, frame: Number(row[3]) })
  } else throw new Error(`line ${String(number)}: "${line}"`)
}

export function parseOpFrames(text: string): OpFrameLog {
  const lines = text.split('\n').filter((line) => line !== '')
  const log: OpFrameLog = { ...parseHeader(lines[0] ?? ''), rows: [] }
  lines.slice(1).forEach((line, i) => {
    parseRow(log, line, i + 2)
  })
  return log
}

// Logs the compare cannot pair op by op; each gets its own line, never a silent pass.
function mismatch(a: OpFrameLog, b: OpFrameLog): string | undefined {
  if (a.stream !== b.stream) return `${a.engine} logs ${a.stream}, ${b.engine} logs ${b.stream}`
  if (a.rows.length !== b.rows.length) {
    return `${a.engine} logs ${String(a.rows.length)} op starts, ${b.engine} ${String(b.rows.length)}: the runs did not play the same ops`
  }
  const other = a.rows.find((row, i) => row.op !== b.rows[i]?.op)
  if (other !== undefined) {
    const theirs = b.rows[other.index]?.op ?? ''
    return `op ${String(other.index)} is ${other.op} in ${a.engine} and ${theirs} in ${b.engine}: the logs are of different streams`
  }
  if ((a.finished === undefined) === (b.finished === undefined)) return undefined
  const [done, open] = a.finished === undefined ? [b, a] : [a, b]
  return `${done.engine} finished at ${String(done.finished)}, ${open.engine} did not finish`
}

/** The frames of each start and of the finish, the finish last. */
const marks = (log: OpFrameLog) => [
  ...log.rows.map((row) => row.frame),
  ...(log.finished === undefined ? [] : [log.finished]),
]

/** Each start, the finish included, at which the gap differs from the one before. */
function gapSteps(a: OpFrameLog, gaps: readonly number[]): Step[] {
  return gaps.flatMap((gap, i) => {
    const by = gap - (gaps[i - 1] ?? gap)
    return by === 0 ? [] : [{ index: i, span: a.rows[i - 1]?.op ?? '', by }]
  })
}

/** The first op whose gap from op 0 passes the threshold; the finish is no op. */
function firstParting(
  a: OpFrameLog,
  b: OpFrameLog,
  gaps: readonly number[],
  threshold: number,
): Parting | undefined {
  const index = gaps.findIndex((gap, i) => i < a.rows.length && Math.abs(gap) > threshold)
  const row = a.rows[index]
  if (row === undefined) return undefined
  const span = a.rows[index - 1]?.op ?? ''
  return {
    ...row,
    frames: [row.frame, b.rows[index]?.frame ?? 0],
    gap: gaps[index] as number,
    span,
  }
}

/** Compares two logs of one stream: the first op past the threshold, END and each step of the gap. */
export function compareOpFrames(
  a: OpFrameLog,
  b: OpFrameLog,
  threshold = DEFAULT_THRESHOLD,
): OpFramesVerdict {
  const problem = mismatch(a, b)
  if (problem !== undefined) return { problem }
  const [ours, theirs] = [marks(a), marks(b)]
  if (ours.length === 0) return { steps: [] }
  const [a0, b0] = [ours[0] as number, theirs[0] as number]
  const gaps = ours.map((frame, i) => (theirs[i] as number) - b0 - (frame - a0))
  const verdict: Compared = { start: [a0, b0], steps: gapSteps(a, gaps) }
  const parting = firstParting(a, b, gaps, threshold)
  if (parting !== undefined) verdict.parting = parting
  if (a.finished !== undefined && b.finished !== undefined)
    verdict.finished = [a.finished, b.finished]
  return verdict
}

const frames = (count: number) =>
  `${String(Math.abs(count))} frame${Math.abs(count) === 1 ? '' : 's'}`
const apart = (gap: number) =>
  gap === 0 ? 'even' : `${frames(gap)} ${gap > 0 ? 'later' : 'earlier'}`
const signed = (count: number) => `${count > 0 ? '+' : ''}${String(count)}`

function sayParting(a: OpFrameLog, b: OpFrameLog, parting: Parting, threshold: number): string {
  const { index, op, frames: pair, gap, span } = parting
  const value = (OP as Record<string, number | undefined>)[op]
  const code = value === undefined ? 'no code' : `0x${value.toString(16).padStart(2, '0')}`
  return `first parting op ${String(index)} ${op} (${code}) at ${a.engine} ${String(pair[0])}, ${b.engine} ${String(pair[1])}: ${b.engine} ${apart(gap)} from op 0, over the threshold of ${String(threshold)}; the span before it is op ${String(index - 1)} ${span}`
}

function saySteps(steps: readonly Step[]): string {
  if (steps.length === 0) return 'the gap never moves'
  const byOp = new Map<string, { count: number; sum: number }>()
  for (const { span, by } of steps) {
    const entry = byOp.get(span) ?? { count: 0, sum: 0 }
    byOp.set(span, { count: entry.count + 1, sum: entry.sum + by })
  }
  const groups = [...byOp].sort((x, y) => Math.abs(y[1].sum) - Math.abs(x[1].sum))
  const said = groups.map(
    ([op, { count, sum }]) =>
      `${op} ${String(count)} time${count === 1 ? '' : 's'}, ${signed(sum)}`,
  )
  return `the gap moves at ${String(steps.length)} op${steps.length === 1 ? '' : 's'}: ${said.join('; ')}`
}

/** The verdict's lines, each starting with the stream's name. */
export function sayOpFrames(
  a: OpFrameLog,
  b: OpFrameLog,
  verdict: OpFramesVerdict,
  threshold = DEFAULT_THRESHOLD,
): string[] {
  const lines = sayVerdict(a, b, verdict, threshold)
  return lines.map((line) => `${a.stream}: ${line}`)
}

function sayVerdict(
  a: OpFrameLog,
  b: OpFrameLog,
  verdict: OpFramesVerdict,
  threshold: number,
): string[] {
  if ('problem' in verdict) return [verdict.problem]
  const { start, parting, finished, steps } = verdict
  if (start === undefined) return ['no op started in either run']
  const lines = [
    `op 0 ${a.rows[0]?.op ?? FINISHED} starts at ${a.engine} ${String(start[0])}, ${b.engine} ${String(start[1])}: ${b.engine} ${apart(start[1] - start[0])}`,
    parting === undefined
      ? `no op parts by more than ${frames(threshold)} from op 0`
      : sayParting(a, b, parting, threshold),
  ]
  if (finished !== undefined) {
    const fromStart = finished[1] - start[1] - (finished[0] - start[0])
    lines.push(
      `END at ${a.engine} ${String(finished[0])}, ${b.engine} ${String(finished[1])}: ${b.engine} ${apart(finished[1] - finished[0])}, ${apart(fromStart)} from op 0`,
    )
  }
  return [...lines, saySteps(steps)]
}

/** Writes a run's log into its folder of frames. */
export function writeOpFrames(dir: string, log: OpFrameLog): void {
  writeFileSync(join(dir, OP_FRAMES_FILE), formatOpFrames(log))
}

function compareStream(stream: string, threshold: number): string[] {
  const read = (dir: string) =>
    parseOpFrames(readFileSync(join(dir, stream, OP_FRAMES_FILE), 'utf8'))
  const mgba = read(join(buildPaths().outDir, 'shots'))
  const module = read(join(wasmPaths(REPO_DIR).out, 'run'))
  const verdict = compareOpFrames(mgba, module, threshold)
  if ('problem' in verdict) throw new Error(`${stream}: ${verdict.problem}`)
  return sayOpFrames(mgba, module, verdict, threshold)
}

function main(): void {
  runCli('op-frames', () => {
    const { values, positionals } = parseArgs({
      options: { threshold: { type: 'string' } },
      allowPositionals: true,
    })
    const threshold = values.threshold === undefined ? DEFAULT_THRESHOLD : Number(values.threshold)
    if (!Number.isInteger(threshold) || threshold < 0 || positionals.length === 0) {
      throw new Error('usage: node scripts/op-frames.ts [--threshold <frames>] <stream>...')
    }
    for (const stream of positionals) {
      for (const line of compareStream(stream, threshold)) process.stdout.write(`${line}\n`)
    }
  })
}

if (import.meta.main) main()
