// npm run wasm:run [-- <name>...] (#35, plan B4): plays the streams of rom:shots in the
// WebAssembly build (build/wasm/irv-emerald.js) in Node and checks the same scenes on its frames.
// The names and the two refusal runs are those of rom:shots (planStreams). A hang inside the
// module cannot be interrupted from Node, so each stream runs in its own process under timeout:
// `--play <dir>` writes the stream into the module's slot, calls AgbMain and answers as the shot
// tool (rom/gen3/shot/replay_shot.c) does, with the frames of its shots as PPM in <dir> and one
// JSON line per shot and the status on stdout. Frames and report.json go to build/wasm/run/.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { writeReplaySlot } from '../src/patch/slot.ts'
import { runCliAsync } from './rom-cli.ts'
import { emptyInside, REPO_DIR } from './rom-paths.ts'
import type { Frame } from './rom-shot-probes.ts'
import {
  INTERPRETER_HEADER_PATH,
  PROGRESS_HEADER_PATH,
  readErrorNames,
  readProgressLayout,
  readToolOutput,
  widenChannel,
} from './rom-shot-run.ts'
import type { ProgressLayout, ToolOutput } from './rom-shot-run.ts'
import type { Scene } from './rom-shot-scenes.ts'
import { finishRuns, parseShotArgs, planStreams, readFrames, reportRun } from './rom-shot.ts'
import type { RunReport, StreamPlan } from './rom-shot.ts'
import { describeSlot, GBA_ROM_BASE, loadSlotLayout, SLOT_SYMBOL } from './rom-slot.ts'
import { wasmPaths } from './wasm-compile.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'
import { wasmRoots } from './wasm-platform.ts'

/** What the harness uses of the module that build/wasm/irv-emerald.js instantiates. */
export interface GameModule {
  HEAPU8: Uint8Array
  HEAPU16: Uint16Array
  _AgbMain(): void
  _IrvWasm_Slot(): number
  _IrvWasm_Progress(): number
}

/** The imports the module calls: the frame (irv_wasm_frame.c) and its two print lines. */
export interface ModuleHooks {
  irvFrame(pixels: number): void
  print(line: string): void
  printErr(line: string): void
}

type ModuleFactory = (hooks: ModuleHooks) => Promise<GameModule>

// The rules of the shot tool's run (replay_shot.c): a stall is this many frames on one op, and a
// refused run ends this many frames after the error, with the refusal screen up.
export const STALL_FRAMES = 3600
const ERROR_FRAMES = 30
const WIDTH = 240
const HEIGHT = 160
// A run of 994052 takes about 41000 frames; the module plays a few hundred per second.
const RUN_SECONDS = 900

type Shot = Scene['shots'][number]
type Status = ToolOutput['status']

interface Progress {
  done: number
  total: number
  turn: number
  error: number
  finished: boolean
  playing: boolean
}

function readProgress(memory: Uint8Array, at: number, layout: ProgressLayout): Progress {
  const view = new DataView(memory.buffer, memory.byteOffset + at, layout.size)
  const { offsets } = layout
  return {
    done: view.getUint16(offsets.done, true),
    total: view.getUint16(offsets.total, true),
    turn: view.getUint16(offsets.turn, true),
    error: view.getUint8(offsets.error),
    finished: view.getUint8(offsets.finished) !== 0,
    playing: view.getUint8(offsets.playing) !== 0,
  }
}

/** The module's 240x160 BGR555 frame as the shot tool's frames show it, each channel widened. */
function readFrame(words: Uint16Array, pixels: number): Frame {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3)
  const first = pixels >> 1
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    const colour = words[first + i] ?? 0
    rgb[i * 3] = widenChannel(colour & 0x1f)
    rgb[i * 3 + 1] = widenChannel((colour >> 5) & 0x1f)
    rgb[i * 3 + 2] = widenChannel((colour >> 10) & 0x1f)
  }
  return { width: WIDTH, height: HEIGHT, rgb }
}

/** The stream goes into the slot through the same rule as into a ROM (src/patch/slot.ts). */
function writeStream(game: GameModule, stream: Uint8Array): void {
  const layout = loadSlotLayout()
  const slot = game._IrvWasm_Slot()
  const memory = game.HEAPU8
  const image = memory.subarray(GBA_ROM_BASE, slot + layout.size)
  const symbol = { name: SLOT_SYMBOL, address: slot, size: layout.size }
  const description = describeSlot(image, symbol, layout)
  const written = writeReplaySlot(image, description, stream)
  memory.set(written.subarray(description.offset, description.offset + layout.size), slot)
}

// Thrown from the frame import to end AgbMain. An object: Emscripten's invoke_* reads a thrown
// number as a longjmp (B3b, R24).
class Stop extends Error {
  override name = 'Stop'
}

/** The shot tool's loop (Play and TakeShots in replay_shot.c), one frame at a time. */
class Watch {
  frame = 0
  finishedAt: number | undefined
  readonly lines: ToolOutput['shots'] = []
  readonly frames = new Map<string, Frame>()
  private readonly due = new Map<string, number>()
  private lastDone = 0
  private lastChange = 0
  private errorFrame = 0

  private readonly shots: readonly Shot[]

  constructor(shots: readonly Shot[]) {
    this.shots = shots
  }

  /** Takes the shots due on this frame; returns the status when the run ends on it. */
  step(progress: Progress, frame: () => Frame): Status['status'] | undefined {
    this.frame++
    this.takeShots(progress, frame)
    this.noteFirsts(progress)
    if (this.errorFrame !== 0 && this.frame - this.errorFrame >= ERROR_FRAMES) return 'error'
    if (progress.finished && !this.shotsDue()) return 'finished'
    if (progress.done !== this.lastDone) {
      this.lastDone = progress.done
      this.lastChange = this.frame
    }
    return this.frame - this.lastChange >= STALL_FRAMES ? 'stall' : undefined
  }

  private noteFirsts(progress: Progress): void {
    if (progress.finished && this.finishedAt === undefined) this.finishedAt = this.frame
    if (progress.error !== 0 && this.errorFrame === 0) this.errorFrame = this.frame
  }

  private takeShots(progress: Progress, frame: () => Frame): void {
    for (const shot of this.shots) {
      if (!this.due.has(shot.name) && progress.playing && progress.done === shot.done) {
        this.due.set(shot.name, this.frame + shot.frames)
      }
      if (this.due.get(shot.name) !== this.frame || this.frames.has(shot.name)) continue
      this.frames.set(shot.name, frame())
      this.lines.push({ shot: shot.name, frame: this.frame, done: progress.done })
    }
  }

  private shotsDue(): boolean {
    return this.shots.some((shot) => this.due.has(shot.name) && !this.frames.has(shot.name))
  }
}

export interface PlayRequest {
  /** The stream for the slot, or undefined for the slot as the link leaves it. */
  stream: Uint8Array | undefined
  scenes: readonly Scene[]
  layout: ProgressLayout
}

export interface PlayResult {
  output: ToolOutput
  /** The frames of the shots and the last frame, `final`. */
  frames: Map<string, Frame>
  /** The first frame on which the interpreter reported `finished`. */
  finishedAt: number | undefined
}

const say = (line: string) => process.stderr.write(`wasm:run: ${line}\n`)

/** Plays one stream in a fresh module until it finishes, is refused or stalls. */
export async function playModule(
  factory: ModuleFactory,
  request: PlayRequest,
): Promise<PlayResult> {
  const watch = new Watch(request.scenes.flatMap((scene) => scene.shots))
  let status: Status | undefined
  const game: GameModule = await factory({
    irvFrame: (pixels) => {
      const memory = game.HEAPU8
      const progress = readProgress(memory, game._IrvWasm_Progress(), request.layout)
      const frame = () => readFrame(game.HEAPU16, pixels)
      const ended = watch.step(progress, frame)
      if (watch.frame % 3000 === 0) say(`frame ${String(watch.frame)}, op ${String(progress.done)}`)
      if (ended === undefined) return
      const { done, total, turn, error } = progress
      status = { status: ended, frame: watch.frame, done, total, turn, error }
      watch.frames.set('final', frame())
      throw new Stop()
    },
    print: (line) => process.stderr.write(`game: ${line}\n`),
    printErr: (line) => process.stderr.write(`game: ${line}\n`),
  })
  if (request.stream !== undefined) writeStream(game, request.stream)
  try {
    game._AgbMain()
  } catch (error) {
    if (!(error instanceof Stop) || status === undefined) {
      throw new Error(`the module trapped after ${String(watch.frame)} frames: ${String(error)}`, {
        cause: error,
      })
    }
    const output = { shots: watch.lines, status }
    return { output, frames: watch.frames, finishedAt: watch.finishedAt }
  }
  throw new Error(`AgbMain returned after ${String(watch.frame)} frames`)
}

const SCRIPT = fileURLToPath(import.meta.url)
const RUN_FILE = 'play.json'
const STREAM_FILE = 'stream.bin'

/** One stream's process: killed `seconds` after its start, and 10 s later if it ignores that. */
export function playCommand(dir: string, seconds: number): string[] {
  return ['timeout', '--kill-after=10', String(seconds), process.execPath, SCRIPT, '--play', dir]
}

function ppm(frame: Frame): Buffer {
  const head = Buffer.from(`P6\n${String(frame.width)} ${String(frame.height)}\n255\n`, 'ascii')
  return Buffer.concat([head, frame.rgb])
}

// The --play side: the run in <dir>, its frames into <dir>, the shot tool's lines on stdout.
async function playDir(dir: string): Promise<void> {
  const { scenes } = JSON.parse(readFileSync(join(dir, RUN_FILE), 'utf8')) as { scenes: Scene[] }
  const streamPath = join(dir, STREAM_FILE)
  const stream = existsSync(streamPath) ? new Uint8Array(readFileSync(streamPath)) : undefined
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const modulePath = join(wasmPaths(REPO_DIR).out, LINK_OUTPUTS.js)
  const factory = ((await import(pathToFileURL(modulePath).href)) as { default: ModuleFactory })
    .default
  const run = await playModule(factory, { stream, scenes, layout })
  for (const [name, frame] of run.frames) writeFileSync(join(dir, `${name}.ppm`), ppm(frame))
  say(`${basename(dir)}: finished first at frame ${String(run.finishedAt ?? 'none')}`)
  const lines = [...run.output.shots, run.output.status]
  process.stdout.write(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
}

function runStream(plan: StreamPlan, runDir: string, errors: readonly string[]): RunReport {
  const dir = join(runDir, plan.name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, RUN_FILE), JSON.stringify({ scenes: plan.scenes }))
  if (plan.stream !== undefined) writeFileSync(join(dir, STREAM_FILE), plan.stream)
  const [command, ...args] = playCommand(dir, RUN_SECONDS)
  const start = performance.now()
  const result = spawnSync(command as string, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
  })
  const seconds = Math.round((performance.now() - start) / 100) / 10
  if (result.error !== undefined) throw result.error
  if (result.status === 124 || result.status === 137) {
    throw new Error(`${plan.name}: no end after ${String(RUN_SECONDS)} s, a hang inside the module`)
  }
  if (result.status !== 0)
    throw new Error(`${plan.name}: the run failed (exit ${String(result.status)})`)
  const output = readToolOutput(result.stdout)
  return reportRun({ plan, output, frames: readFrames(dir), errors, seconds })
}

async function runStreams(names: readonly string[]): Promise<void> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const errors = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))
  const plans = await planStreams(names, layout)
  const runDir = join(wasmPaths(REPO_DIR).out, 'run')
  mkdirSync(runDir, { recursive: true })
  emptyInside(wasmRoots(REPO_DIR), runDir)
  const reports = plans.map((plan) => runStream(plan, runDir, errors))
  finishRuns(reports, runDir, (line) => process.stdout.write(`wasm:run: ${line}\n`))
}

async function main(): Promise<void> {
  await runCliAsync('wasm:run', async () => {
    const argv = process.argv.slice(2)
    if (argv[0] === '--play' && argv[1] !== undefined) await playDir(argv[1])
    else await runStreams(parseShotArgs(argv))
  })
}

if (import.meta.main) await main()
