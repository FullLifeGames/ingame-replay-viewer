// npm run wasm:run [-- <name>...] (#35, plan B4): plays the streams of rom:shots in the
// WebAssembly build (build/wasm/irv-emerald.js) in Node and checks the same scenes on its frames.
// The names, hand-made-b with B held from the first frame and the two refusal runs are those of
// rom:shots (planStreams, withHeldB). A hang inside the
// module cannot be interrupted from Node, so each stream runs in its own process under timeout:
// `--play <dir>` writes the stream into the module's slot, calls AgbMain and answers as the shot
// tool (rom/gen3/shot/replay_shot.c) does, with the frames of its shots as PPM in <dir> and one
// JSON line per shot and the status on stdout, and END or the trap in <dir>/outcome.json. Frames
// and report.json go to build/wasm/run/.
// `--baseline` and `--against-baseline` add the A/B of wasm-hashes.ts (#43). `--sanitize shift`
// plays the module of `wasm:build -- --sanitize shift` (#44) and writes under build/wasm/sanitize.
// `--all` plays every test replay after the named streams. A stream that fails ends only itself;
// wasm-run-report.ts reports each stream's END or failure (#66).
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { writeReplaySlot } from '../src/patch/slot.ts'
import { AudioMeter } from '../src/web/wasm/audio.ts'
import { FRAME_HEIGHT, FRAME_WIDTH, widenFrame } from '../src/web/wasm/frame.ts'
import type { GameModule, ModuleHooks } from '../src/web/wasm/game.ts'
import { readProgress } from '../src/web/wasm/progress.ts'
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
import {
  parseShotArgs,
  planStreams,
  readFrames,
  reportRun,
  withEveryTestReplay,
  withHeldB,
} from './rom-shot.ts'
import type { ShotPlan } from './rom-shot.ts'
import { describeSlot, GBA_ROM_BASE, loadSlotLayout, SLOT_SYMBOL } from './rom-slot.ts'
import { sanitizedDir, wasmPaths, wasmRoots } from './wasm-compile.ts'
import type { Sanitizer } from './wasm-compile.ts'
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
import {
  finishStreams,
  ModuleTrap,
  playStreams,
  readEnd,
  sayMusic,
  secondsSince,
  writeOutcome,
} from './wasm-run-report.ts'
import type { StreamReport } from './wasm-run-report.ts'
import { SoundLog } from './wasm-run-sound.ts'
import { Watch } from './wasm-run-watch.ts'

// The module's shape lives in src/web/wasm, which the page's worker shares.
export { STALL_FRAMES } from './wasm-run-watch.ts'
export type { GameModule, ModuleHooks } from '../src/web/wasm/game.ts'

type ModuleFactory = (hooks: ModuleHooks) => Promise<GameModule>

// A run of 994052 takes about 41000 frames; the module plays a few hundred per second.
const RUN_SECONDS = 900

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

// KEYINPUT and two of its bits (include/gba/io_reg.h); a held key's bit is low. The module maps the
// GBA's addresses one to one into its memory (irv_wasm_layout.c), so the game's ReadKeys reads
// what the runner writes there before a frame.
const KEYINPUT = 0x04000130
const KEYS_MASK = 0x03ff
const B_BUTTON = 0x0002

/** Holds B for frame `next` and on when the run holds it from frame `from` (#68). */
function holdB(game: GameModule, next: number, from: number | undefined): void {
  if (from !== undefined && next >= from) game.HEAPU16[KEYINPUT >> 1] = KEYS_MASK & ~B_BUTTON
}

// Thrown from the frame import to end AgbMain. An object: Emscripten's invoke_* reads a thrown
// number as a longjmp (B3b, R24).
class Stop extends Error {
  override name = 'Stop'
}

export interface PlayRequest {
  /** The stream for the slot, or undefined for the slot as the link leaves it. */
  stream: Uint8Array | undefined
  scenes: readonly Scene[]
  layout: ProgressLayout
  /** Hold B from this frame on, the first frame being 1, as the shot tool's --hold-b-from. */
  holdBFrom?: number | undefined
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
      holdB(game, watch.frame + 1, request.holdBFrom)
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
  holdB(game, 1, request.holdBFrom)
  try {
    game._AgbMain()
  } catch (error) {
    if (!(error instanceof Stop) || status === undefined) throw new ModuleTrap(watch.frame, error)
    const output = { shots: watch.lines, status }
    const { frames, finishedAt } = watch
    return { output, frames, finishedAt, audio, sound, hashes: hashes.done() }
  }
  throw new Error(`AgbMain returned after ${String(watch.frame)} frames`)
}

const SCRIPT = fileURLToPath(import.meta.url)

/** The module a run plays and where its streams' folders go: out is build/wasm. */
export function runPlace(out: string, sanitize?: Sanitizer): { module: string; runDir: string } {
  const dir = sanitize === undefined ? out : sanitizedDir(out)
  return { module: join(dir, LINK_OUTPUTS.js), runDir: join(dir, 'run') }
}

// The scenes and the module of one stream, for its --play process.
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
  const { scenes, module, holdBFrom } = JSON.parse(readFileSync(join(dir, RUN_FILE), 'utf8')) as {
    scenes: Scene[]
    module: string
    holdBFrom?: number
  }
  const streamPath = join(dir, STREAM_FILE)
  const stream = existsSync(streamPath) ? new Uint8Array(readFileSync(streamPath)) : undefined
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const factory = ((await import(pathToFileURL(module).href)) as { default: ModuleFactory }).default
  let run: PlayResult
  try {
    run = await playModule(factory, { stream, scenes, layout, holdBFrom })
  } catch (error) {
    if (!(error instanceof ModuleTrap)) throw error
    say(`${basename(dir)}: ${error.message}`)
    writeOutcome(dir, { trap: String(error.cause), frame: error.frame })
    return
  }
  writeOutcome(dir, { end: run.finishedAt })
  for (const [name, frame] of run.frames) writeFileSync(join(dir, `${name}.ppm`), ppm(frame))
  writeHashes(join(dir, RUN_HASHES), run.hashes)
  say(`${basename(dir)}: finished first at frame ${String(run.finishedAt ?? 'none')}`)
  const { samples, rms } = run.audio
  const perFrame = samples / run.output.status.frame
  say(
    `${basename(dir)}: sound ${String(samples)} samples, ${perFrame.toFixed(1)} per frame, rms ${rms.toFixed(4)}`,
  )
  sayMusic(basename(dir), run.sound, run.output.status.frame, say)
  const lines = [...run.output.shots, run.output.status]
  process.stdout.write(lines.map((line) => `${JSON.stringify(line)}\n`).join(''))
}

interface StreamRun {
  runDir: string
  module: string
  errors: readonly string[]
  baseline: { mode: RunArgs['mode']; out: string }
}

function runStream(plan: ShotPlan, { runDir, module, errors, baseline }: StreamRun): StreamReport {
  const dir = join(runDir, plan.name)
  mkdirSync(dir, { recursive: true })
  const { scenes, holdBFrom } = plan
  writeFileSync(join(dir, RUN_FILE), JSON.stringify({ scenes, module, holdBFrom }))
  if (plan.stream !== undefined) writeFileSync(join(dir, STREAM_FILE), plan.stream)
  const [command, ...args] = playCommand(dir, RUN_SECONDS)
  const start = performance.now()
  const result = spawnSync(command as string, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 16 * 1024 * 1024,
  })
  const seconds = secondsSince(start)
  if (result.error !== undefined) throw result.error
  if (result.status === 124 || result.status === 137) {
    throw new Error(`${plan.name}: no end after ${String(RUN_SECONDS)} s, a hang inside the module`)
  }
  if (result.status !== 0)
    throw new Error(`${plan.name}: the run failed (exit ${String(result.status)})`)
  const end = readEnd(dir)
  const output = readToolOutput(result.stdout)
  const report = reportRun({ plan, output, frames: readFrames(dir), errors, seconds })
  const settled = settleBaseline(baseline, plan.name, join(dir, RUN_HASHES))
  if (settled.equal !== undefined) say(settled.equal)
  const problems = [...report.problems, ...settled.problems]
  return { ...report, end, problems, ...(settled.noBaseline ? { noBaseline: true } : {}) }
}

async function runStreams({ mode, names, sanitize, all }: RunArgs): Promise<void> {
  const layout = readProgressLayout(readFileSync(PROGRESS_HEADER_PATH, 'utf8'))
  const errors = readErrorNames(readFileSync(INTERPRETER_HEADER_PATH, 'utf8'))
  const named = parseShotArgs(all === true ? withEveryTestReplay(names) : names)
  const plans = withHeldB(await planStreams(named, layout))
  const { out } = wasmPaths(REPO_DIR)
  startBaseline(mode, out, plans)
  const { module, runDir } = runPlace(out, sanitize)
  mkdirSync(runDir, { recursive: true })
  emptyInside(wasmRoots(REPO_DIR), runDir)
  const run = { runDir, module, errors, baseline: { mode, out } }
  const reports = await playStreams(plans, (plan) => Promise.resolve(runStream(plan, run)))
  const failed = finishStreams(reports, runDir, (line) =>
    process.stdout.write(`wasm:run: ${line}\n`),
  )
  if (failed > 0) process.exitCode = 1
}

async function main(): Promise<void> {
  await runCliAsync('wasm:run', async () => {
    const argv = process.argv.slice(2)
    if (argv[0] === '--play' && argv[1] !== undefined) await playDir(argv[1])
    else await runStreams(parseRunArgs(argv))
  })
}

if (import.meta.main) await main()
