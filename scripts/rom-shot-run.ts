// One run of the shot tool (rom/gen3/shot/replay_shot.c): its build against libmgba, the address
// it reads gReplayProgress at, its output, and the verdict on a run.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ROM_DIR } from './rom-config.ts'
import { findSymbol } from './rom-slot.ts'

// The progress layout lives in src/web/wasm, which the page's worker shares.
export { readProgressLayout } from '../src/web/wasm/progress.ts'
export type { ProgressLayout } from '../src/web/wasm/progress.ts'

// replay_state.c dumps the video state for the mGBA oracle of the WebAssembly build (#43).
export const TOOL_SOURCES = ['replay_shot.c', 'replay_state.c'].map((name) =>
  join(ROM_DIR, 'shot', name),
)
const TOOL_HEADER = join(ROM_DIR, 'shot', 'replay_state.h')
const INCLUDE_DIR = join(ROM_DIR, 'include')
export const INTERPRETER_HEADER_PATH = join(INCLUDE_DIR, 'replay_interpreter.h')
// The layout the tool reads; it includes this header too, and the ROM checks it against the struct.
export const PROGRESS_HEADER_PATH = join(INCLUDE_DIR, 'replay_progress.h')

const PROGRESS_SYMBOL = 'gReplayProgress'

interface ShotLine {
  shot: string
  frame: number
  done: number
}

interface StatusLine {
  status: 'finished' | 'error' | 'stall'
  frame: number
  done: number
  total: number
  turn: number
  error: number
}

export interface ToolOutput {
  shots: ShotLine[]
  status: StatusLine
}

export interface SceneVerdict {
  name: string
  pass: boolean
  detail: string
}

/** What a run should end in: 'finished' for the whole replay, else the enum ReplayError name of a refusal. */
export type Expected = string

/** The names of enum ReplayError without their prefix, at their numbers. */
export function readErrorNames(headerText: string): string[] {
  const body = /enum ReplayError\s*\{([^}]*)\}/.exec(headerText)?.[1]
  if (body === undefined) throw new Error('replay_interpreter.h: enum ReplayError missing')
  const names: string[] = []
  for (const line of body.split('\n')) {
    const entry = line.replace(/\/\/.*$/, '').trim()
    if (entry === '') continue
    const match = /^REPLAY_ERROR_(\w+),?$/.exec(entry)
    if (match === null) throw new Error(`replay_interpreter.h: "${entry}" is no plain enum entry`)
    names.push(match[1] as string)
  }
  return names
}

export function progressAddress(nmOutput: string, size: number): number {
  let symbol
  try {
    symbol = findSymbol(nmOutput, PROGRESS_SYMBOL)
  } catch (error) {
    throw new Error(`${PROGRESS_SYMBOL} not in the ELF: this ROM does not boot into a replay`, {
      cause: error,
    })
  }
  if (symbol.size !== size) {
    throw new Error(
      `${PROGRESS_SYMBOL} has ${String(symbol.size)} bytes, the shot tool reads ${String(size)}`,
    )
  }
  return symbol.address
}

export function toolBuildArgs(sources: readonly string[], output: string): string[] {
  const warnings = ['-Wall', '-Wextra', '-Werror']
  return ['-std=gnu11', '-O2', ...warnings, '-I', INCLUDE_DIR, '-o', output, ...sources, '-lmgba']
}

/** Builds the tool when it is missing or older than its sources or the headers it reads. */
export function buildTool(output: string): void {
  const newest = Math.max(
    ...[...TOOL_SOURCES, TOOL_HEADER, PROGRESS_HEADER_PATH].map((path) => statSync(path).mtimeMs),
  )
  if (existsSync(output) && statSync(output).mtimeMs >= newest) return
  mkdirSync(dirname(output), { recursive: true })
  // CC names another C compiler, as make has it.
  const compiler = process.env.CC ?? 'cc'
  const result = spawnSync(compiler, toolBuildArgs(TOOL_SOURCES, output), { encoding: 'utf8' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `${compiler} could not build the shot tool; it needs libmgba-dev (sudo apt-get install libmgba-dev)\n${result.stderr.trim()}`,
    )
  }
}

export function readToolOutput(text: string): ToolOutput {
  const shots: ShotLine[] = []
  let status: StatusLine | undefined
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    const value = JSON.parse(line) as Partial<ShotLine & StatusLine>
    if (value.status !== undefined) status = value as StatusLine
    else shots.push(value as ShotLine)
  }
  if (status === undefined) throw new Error('the shot tool ended without a status')
  return { shots, status }
}

/**
 * The cartridge clock the tool gives mGBA, in seconds since 1970 UTC: noon on 1 January 2000, the
 * time the module's clock stub holds (sFixedTime in rom/gen3/wasm/src/irv_wasm_stubs.c). With the
 * host's clock two runs of one stream parted at frame 10 (#43, step B4).
 */
export const TOOL_CLOCK = Date.UTC(2000, 0, 1, 12) / 1000

export interface ToolRun {
  tool: string
  rom: string
  address: number
  frameDir: string
  shots: string[]
  /** Dump the video state and the frame every N frames, for the mGBA oracle (#43). */
  stateEvery?: number
  /** Hold B from N frames after the replay reports finished to the run's end (#30). */
  holdBFromEnd?: number
}

const option = (name: string, value: number | undefined) =>
  value === undefined ? [] : [name, String(value)]

export function toolArgs(run: ToolRun): string[] {
  const options = [
    ...option('--clock', TOOL_CLOCK),
    ...option('--state-every', run.stateEvery),
    ...option('--hold-b-from-end', run.holdBFromEnd),
  ]
  return [run.rom, `0x${run.address.toString(16)}`, run.frameDir, ...options, ...run.shots]
}

export function runTool(run: ToolRun): ToolOutput {
  mkdirSync(run.frameDir, { recursive: true })
  const options = { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 } as const
  const result = spawnSync(run.tool, toolArgs(run), options)
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`the shot tool failed: ${result.stderr.trim()}`)
  return readToolOutput(result.stdout)
}

export interface Judged {
  expect: Expected
  output: ToolOutput
  scenes: readonly SceneVerdict[]
  errors: readonly string[]
  /** The scenes the run must have and its stream lacks. */
  missing?: readonly string[]
}

const errorName = (errors: readonly string[], error: number) =>
  errors[error] ?? `number ${String(error)}`

const sceneProblems = (scenes: readonly SceneVerdict[]) =>
  scenes.filter((scene) => !scene.pass).map((scene) => `scene ${scene.name}: ${scene.detail}`)

function judgeRefusal(run: Judged): string[] {
  const { status } = run.output
  const name = errorName(run.errors, status.error)
  if (status.status === 'error' && name === run.expect) return sceneProblems(run.scenes)
  const found = status.status === 'error' ? `error ${name}` : `status ${status.status}`
  return [`${found}, expected ${run.expect}`, ...sceneProblems(run.scenes)]
}

function judgeReplay(run: Judged): string[] {
  const { status } = run.output
  const problems: string[] = []
  if (status.status !== 'finished') problems.push(`status ${status.status}, expected finished`)
  if (status.done !== status.total || status.total === 0) {
    problems.push(`${String(status.done)} of ${String(status.total)} instructions done`)
  }
  if (status.error !== 0) problems.push(`error ${errorName(run.errors, status.error)}`)
  const missing = (run.missing ?? []).map((name) => `missing scene ${name}: the stream has none`)
  return [...problems, ...missing, ...sceneProblems(run.scenes)]
}

/** What went wrong in a run; an empty list is a pass. */
export function judgeRun(run: Judged): string[] {
  return run.expect === 'finished' ? judgeReplay(run) : judgeRefusal(run)
}
