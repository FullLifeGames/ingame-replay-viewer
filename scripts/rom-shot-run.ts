// One run of the shot tool (rom/gen3/shot/replay_shot.c): its build against libmgba, the address
// it reads gReplayProgress at, its output, and the verdict on a run.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { ROM_DIR } from './rom-config.ts'
import { findSymbol } from './rom-slot.ts'

const TOOL_SOURCE = join(ROM_DIR, 'shot', 'replay_shot.c')
export const INTERPRETER_HEADER_PATH = join(ROM_DIR, 'include', 'replay_interpreter.h')

const PROGRESS_SYMBOL = 'gReplayProgress'
// sizeof(struct ReplayProgress): the offsets the tool reads (PROGRESS_* in replay_shot.c).
const PROGRESS_SIZE = 8

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

export function progressAddress(nmOutput: string): number {
  let symbol
  try {
    symbol = findSymbol(nmOutput, PROGRESS_SYMBOL)
  } catch (error) {
    throw new Error(`${PROGRESS_SYMBOL} not in the ELF: this ROM does not boot into a replay`, {
      cause: error,
    })
  }
  if (symbol.size !== PROGRESS_SIZE) {
    throw new Error(
      `${PROGRESS_SYMBOL} has ${String(symbol.size)} bytes, the shot tool reads ${String(PROGRESS_SIZE)}`,
    )
  }
  return symbol.address
}

export function toolBuildArgs(source: string, output: string): string[] {
  return ['-std=gnu11', '-O2', '-Wall', '-Wextra', '-Werror', '-o', output, source, '-lmgba']
}

/** Builds the tool when it is missing or older than its source. */
export function buildTool(output: string): void {
  if (existsSync(output) && statSync(output).mtimeMs >= statSync(TOOL_SOURCE).mtimeMs) return
  mkdirSync(dirname(output), { recursive: true })
  // CC names another C compiler, as make has it.
  const compiler = process.env.CC ?? 'cc'
  const result = spawnSync(compiler, toolBuildArgs(TOOL_SOURCE, output), { encoding: 'utf8' })
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

export interface ToolRun {
  tool: string
  rom: string
  address: number
  frameDir: string
  shots: string[]
}

export function runTool(run: ToolRun): ToolOutput {
  mkdirSync(run.frameDir, { recursive: true })
  const args = [run.rom, `0x${run.address.toString(16)}`, run.frameDir, ...run.shots]
  const result = spawnSync(run.tool, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`the shot tool failed: ${result.stderr.trim()}`)
  return readToolOutput(result.stdout)
}

export interface Judged {
  expect: Expected
  output: ToolOutput
  scenes: readonly SceneVerdict[]
  errors: readonly string[]
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
  return [...problems, ...sceneProblems(run.scenes)]
}

/** What went wrong in a run; an empty list is a pass. */
export function judgeRun(run: Judged): string[] {
  return run.expect === 'finished' ? judgeReplay(run) : judgeRefusal(run)
}
