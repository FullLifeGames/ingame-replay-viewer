// npm run wasm:run [-- <name>...] (#35, plan B4): plays the streams of rom:shots in the
// WebAssembly build (build/wasm/irv-emerald.js) in Node and checks the same scenes on its frames.
// The names and the two refusal runs are those of rom:shots (planStreams). A hang inside the
// module cannot be interrupted from Node, so each stream runs in its own process under timeout:
// `--play <dir>` writes the stream into the module's slot, calls AgbMain and answers as the shot
// tool (rom/gen3/shot/replay_shot.c) does, with the frames of its shots as PPM in <dir> and one
// JSON line per shot and the status on stdout. Frames and report.json go to build/wasm/run/.
// `--baseline` and `--against-baseline` add the A/B of wasm-hashes.ts (#43).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { writeReplaySlot } from '../src/patch/slot.ts'
import { AudioMeter } from '../src/web/wasm/audio.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, widenFrame } from '../src/web/wasm/frame.ts'
import type { GameModule, ModuleHooks } from '../src/web/wasm/game.ts'
import { readProgress } from '../src/web/wasm/progress.ts'
import type { Progress } from '../src/web/wasm/progress.ts'
import { runCliAsync } from './rom-cli.ts'
import { emptyInside, REPO_DIR } from './rom-paths.ts'
import type { Frame } from './rom-shot-probes.ts'
import {
  INTERPRETER_HEADER_PATH,
  PROGRESS_HEADER_PATH,
  readErrorNames,
  readProgressLayout,
  readToolOutput,
} from './rom-shot-run.ts'
import type { ProgressLayout, ToolOutput } from './rom-shot-run.ts'
import type { Scene } from './rom-shot-scenes.ts'
import { finishRuns, parseShotArgs, planStreams, readFrames, reportRun } from './rom-shot.ts'
import type { RunReport, StreamPlan } from './rom-shot.ts'
import { describeSlot, GBA_ROM_BASE, loadSlotLayout, SLOT_SYMBOL } from './rom-slot.ts'
import { wasmPaths } from './wasm-compile.ts'
import {
  HashLog,
  parseRunArgs,
  RUN_HASHES,
  settleBaseline,
  startBaseline,
  writeHashes,
} from './wasm-hashes.ts'
import type { RunArgs, RunHashes } from './wasm-hashes.ts'
import { LINK_OUTPUTS } from './wasm-link.ts'
import { wasmRoots } from './wasm-platform.ts'
import { SoundLog } from './wasm-run-sound.ts'

// The module's shape lives in src/web/wasm, which the page's worker shares.
export type { GameModule, ModuleHooks } from '../src/web/wasm/game.ts'

type ModuleFactory = (hooks: ModuleHooks) => Promise<GameModule>

// The rules of the shot tool's run (replay_shot.c): a stall is this many frames on one op, and a
// refused run ends this many frames after the error, with the refusal screen up.
export const STALL_FRAMES = 3600
const ERROR_FRAMES = 30
// A run of 994052 takes about 41000 frames; the module plays a few hundred per second.
const RUN_SECONDS = 900

type Shot = Scene['shots'][number]
type Status = ToolOutput['status']

/** The module's 240x160 BGR555 frame as the shot tool's frames show it, each channel widened. */
function readFrame(words: Uint16Array, pixels: number): Frame {
  const rgb = new Uint8Array(FRAME_WIDTH * FRAME_HEIGHT * 3)
  widenFrame(words, pixels >> 1, rgb, 3)
  return { width: FRAME_WIDTH, height: FRAME_HEIGHT, rgb }
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
  /** The game's sound over the run: its samples, left and right counted apart, and their RMS. */
  audio: AudioMeter
  /** Each frame's level and the BGM player's songs (O7). */
  sound: SoundLog
  /** The line hashes of every frame of the run, for the A/B against the baseline. */
  hashes: RunHashes
}

const say = (line: string) => process.stderr.write(`wasm:run: ${line}\n`)

/** Plays one stream in a fresh module until it finishes, is refused or stalls. */
export async function playModule(
  factory: ModuleFactory,
  request: PlayRequest,
): Promise<PlayResult> {
  const watch = new Watch(request.scenes.flatMap((scene) => scene.shots))
  let status: Status | undefined
  const audio = new AudioMeter()
  const sound = new SoundLog()
  const hashes = new HashLog()
  const game: GameModule = await factory({
    irvAudio: (samples, count) => {
      const frame = new Float32Array(game.HEAPU8.buffer, game.HEAPU8.byteOffset + samples, count)
      audio.add(frame)
      sound.add(frame)
    },
    irvFrame: (pixels) => {
      const memory = game.HEAPU8
      hashes.add(memory.subarray(pixels, pixels + FRAME_WIDTH * FRAME_HEIGHT * 2))
      const progress = readProgress(memory, game._IrvWasm_Progress(), request.layout)
      const frame = () => readFrame(game.HEAPU16, pixels)
      const ended = watch.step(progress, frame)
      sound.frame(watch.frame, memory)
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
    const { frames, finishedAt } = watch
    return { output, frames, finishedAt, audio, sound, hashes: hashes.done() }
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
  writeHashes(join(dir, RUN_HASHES), run.hashes)
  say(`${basename(dir)}: finished first at frame ${String(run.finishedAt ?? 'none')}`)
  const { samples, rms } = run.audio
  const perFrame = samples / run.output.status.frame
  say(
    `${basename(dir)}: sound ${String(samples)} samples, ${perFrame.toFixed(1)} per frame, rms ${rms.toFixed(4)}`,
  )
  sayMusic(basename(dir), run.sound, run.output.status.frame)
  const lines = [...run.output.shots, run.output.status]
  process.stdout.write(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
}

// O7: the BGM songs and the level by second from 5 s before the last song change to the end.
function sayMusic(name: string, sound: SoundLog, end: number): void {
  const songs = sound.songs.map(
    (song) => `${String(song.tracks)} tracks from ${String(song.frame)}`,
  )
  say(`${name}: BGM songs ${songs.join(', ')}`)
  const from = Math.max(1, (sound.songs.at(-1)?.frame ?? end) - 300)
  const levels = sound.seconds(from, end).map((level) => level.toFixed(4))
  say(`${name}: sound by second from frame ${String(from)}: ${levels.join(' ')}`)
}

interface StreamRun {
  runDir: string
  errors: readonly string[]
  baseline: { mode: RunArgs['mode']; out: string }
}

function runStream(plan: StreamPlan, { runDir, errors, baseline }: StreamRun): RunReport {
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
  const report = reportRun({ plan, output, frames: readFrames(dir), errors, seconds })
  const settled = settleBaseline(baseline, plan.name, join(dir, RUN_HASHES))
  if (settled.equal !== undefined) say(settled.equal)
  return { ...report, problems: [...report.problems, ...settled.problems] }
}

async function runStreams({ mode, names }: RunArgs): Promise<void> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const errors = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))
  const plans = await planStreams(parseShotArgs(names), layout)
  const { out } = wasmPaths(REPO_DIR)
  startBaseline(mode, out, plans)
  const runDir = join(out, 'run')
  mkdirSync(runDir, { recursive: true })
  emptyInside(wasmRoots(REPO_DIR), runDir)
  const run = { runDir, errors, baseline: { mode, out } }
  const reports = plans.map((plan) => runStream(plan, run))
  finishRuns(reports, runDir, (line) => process.stdout.write(`wasm:run: ${line}\n`))
}

async function main(): Promise<void> {
  await runCliAsync('wasm:run', async () => {
    const argv = process.argv.slice(2)
    if (argv[0] === '--play' && argv[1] !== undefined) await playDir(argv[1])
    else await runStreams(parseRunArgs(argv))
  })
}

if (import.meta.main) await main()
