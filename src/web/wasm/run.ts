// One run of the game on the WebAssembly spike page (#35): the module built from the dump, the
// worker, the shared buffers, the tick clock and the sound. main.ts holds the page's state and
// starts and stops runs through this file. The e2e covers it, as it covers the page's wiring.
import { applyBps } from '../../patch/bps-apply'
import type { SlotDescription } from '../../patch/slot'
import { fetchBytes, fetchJson } from '../fetch'
import { messageOf } from '../message'
import { checkBaseRom, readSlotDescription } from '../rom'
import { ROM_FILES } from '../rom-files'
import {
  AUDIO_PROCESSOR,
  AUDIO_STOP,
  AudioMeter,
  type AudioProcessorOptions,
  soundLine,
} from './audio'
import workletUrl from './audio-worklet.ts?worker&url'
import { buildFailure } from './failures'
import { WASM_FILES } from './files'
import type { StartMessage, WorkerReport } from './messages'
import {
  createShared,
  GBA_FRAMES_PER_SECOND,
  MIXER_RATE,
  readStatus,
  type RunStatus,
  type Speed,
  speedAtEnd,
  TickClock,
  writePace,
} from './protocol'
import { AudioRing } from './ring'

// About 1.56 s of the game's sound, left and right: the ring takes a power of two (ring.ts).
const AUDIO_CAPACITY = 2 ** 17
// The latency cap: at most 0.2 s of sound waits in the ring. Past it, the worklet skips the oldest
// samples down to 0.1 s, so a worker that writes faster than the audio clock plays stays in step.
const AUDIO_LATENCY = 2 * Math.round(MIXER_RATE / 5)
// The reserve (#47): two frames of sound, 1408 pairs or 33 ms, wait in the ring before the worklet
// plays, at the start and after each dry spell. It stays under half of the cap's 0.1 s floor.
const AUDIO_RESERVE = 2 * 2 * Math.round(MIXER_RATE / GBA_FRAMES_PER_SECOND)
// The newest samples the test hook measures: about a tenth of a second.
const MEASURED_SAMPLES = 8192

export interface Built {
  readonly module: WebAssembly.Module
  readonly slot: SlotDescription
  readonly bytes: number
}

export interface Picked {
  readonly id: string
  readonly stream: Uint8Array
}

/** The page's audio context, or the line that says why a run plays without sound. */
export type Sound = AudioContext | string

/** One run of the game: its worker, its shared buffers, its clock and its sound, if any. */
export interface Run {
  readonly worker: Worker
  readonly control: Int32Array
  /** The two frame buffers; the page reads them through readFrame (frame-swap.ts) only. */
  readonly frames: SharedArrayBuffer
  readonly clock: TickClock
  readonly ring: AudioRing
  readonly output: AudioWorkletNode | undefined
  /** Why the run plays without sound; undefined when it has sound. */
  readonly silence: string | undefined
  readonly startedAt: number
  finishedMs: number | undefined
  /** The samples written into the ring by the page's first look at END. */
  writtenToEnd: number | undefined
  /** The worker's failure line, once it failed. */
  failure: string | undefined
}

export async function buildModule(dump: Uint8Array): Promise<Built> {
  await checkBaseRom(dump)
  const [patch, json] = await Promise.all([fetchBytes(WASM_FILES.patch), fetchJson(ROM_FILES.slot)])
  const slot = readSlotDescription(json)
  try {
    const bytes = applyBps(patch, dump)
    const module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>)
    return { module, slot, bytes: bytes.length }
  } catch (error: unknown) {
    throw buildFailure(error)
  }
}

/**
 * The page's one audio context, opened on the first Start, the user's gesture that lets a page
 * play sound. When it fails to open, the run plays without sound, and the next Start tries again.
 */
export class AudioOpener {
  private context: Promise<AudioContext> | undefined

  async open(): Promise<Sound> {
    this.context ??= AudioOpener.load()
    let opened: AudioContext
    try {
      opened = await this.context
    } catch (error: unknown) {
      this.context = undefined
      return `the page could not open its audio: ${messageOf(error)}`
    }
    return opened.resume().then(
      () => opened,
      (error: unknown) => `the audio did not start: ${messageOf(error)}`,
    )
  }

  private static async load(): Promise<AudioContext> {
    const context = new AudioContext()
    await context.audioWorklet.addModule(workletUrl)
    return context
  }
}

/** The run's sound: a processor that plays the ring into the context, or why there is none. */
function connectRing(sound: Sound, ring: SharedArrayBuffer) {
  if (typeof sound === 'string') return { output: undefined, silence: sound }
  const processorOptions: AudioProcessorOptions = {
    ring,
    rate: MIXER_RATE,
    latency: AUDIO_LATENCY,
    reserve: AUDIO_RESERVE,
  }
  try {
    const node = new AudioWorkletNode(sound, AUDIO_PROCESSOR, {
      numberOfInputs: 0,
      outputChannelCount: [2],
      processorOptions,
    })
    node.connect(sound.destination)
    return { output: node, silence: undefined }
  } catch (error: unknown) {
    return { output: undefined, silence: `the audio worklet failed: ${messageOf(error)}` }
  }
}

/** Starts a run. The sound is connected before the worker exists, so nothing fails in between. */
export function startRun(built: Built, picked: Picked, speed: Speed, sound: Sound): Run {
  const buffers = createShared(AUDIO_CAPACITY)
  writePace(new Int32Array(buffers.control), speed)
  const { output, silence } = connectRing(sound, buffers.audio)
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const message: StartMessage = {
    type: 'start',
    module: built.module,
    glueUrl: new URL(WASM_FILES.glue, document.baseURI).href,
    stream: picked.stream,
    slot: built.slot,
    buffers,
  }
  worker.postMessage(message)
  const now = performance.now()
  return {
    worker,
    control: new Int32Array(buffers.control),
    frames: buffers.frames,
    clock: new TickClock(speed, now),
    ring: new AudioRing(buffers.audio),
    output,
    silence,
    startedAt: now,
    finishedMs: undefined,
    writtenToEnd: undefined,
    failure: undefined,
  }
}

/** Keeps the worker's failure line in the run and hands it to `show`. */
export function watchRun(run: Run, show: (line: string) => void): void {
  const fail = (line: string) => {
    run.failure = line
    show(line)
  }
  run.worker.onmessage = (event: MessageEvent<WorkerReport>) => {
    if (event.data.type === 'failed') fail(event.data.line)
  }
  run.worker.onerror = (event) => {
    fail(`The worker failed: ${event.message}`)
  }
}

/** Ends a run: its worker, and its processor on the audio thread (AUDIO_STOP). */
export function stopRun(run: Run): void {
  run.worker.terminate()
  run.output?.port.postMessage(AUDIO_STOP)
  run.output?.disconnect()
}

/** The page's first look at END: the time and the sound so far. Returns the speed from now on. */
export function reachEnd(run: Run, now: number): Speed {
  run.finishedMs = now - run.startedAt
  run.writtenToEnd = run.ring.totalWritten
  return speedAtEnd(run.clock.speed)
}

/** The run's progress, with the sound's skips and dry spells while it has sound (#47). */
export const progressLine = (status: RunStatus, run: Run): string => {
  const finished =
    run.finishedMs === undefined
      ? ''
      : ` Finished at frame ${String(status.finishedAt)} after ${(run.finishedMs / 1000).toFixed(1)} s.`
  const sound = run.output === undefined ? '' : ` ${soundLine(run.ring)}`
  return `Frame ${String(status.frame)}, instruction ${String(status.done)} of ${String(status.total)}, turn ${String(status.turn)}.${finished}${sound}`
}

export const runningLine = (picked: Picked, run: Run): string => {
  const silent = run.silence === undefined ? '' : ` It plays without sound: ${run.silence}.`
  return `Running ${picked.id}: ${String(picked.stream.length)} bytes of instruction stream.${silent}`
}

/** The sound's numbers for the test hook: what went through the ring and how loud it was. */
function audioStatus(run: Run) {
  const { ring } = run
  const recent = new Float32Array(MEASURED_SAMPLES)
  const meter = new AudioMeter()
  meter.add(recent.subarray(recent.length - ring.recent(recent)))
  const context = run.output?.context as AudioContext | undefined
  return {
    written: ring.totalWritten,
    read: ring.totalRead,
    writtenToEnd: run.writtenToEnd,
    overruns: ring.overruns,
    skipped: ring.skipped,
    underruns: ring.underruns,
    rms: meter.rms,
    rate: context?.sampleRate,
    state: context?.state,
    silence: run.silence,
  }
}

/** The test hook's view of a run (e2e/wasm-spike.spec.ts). */
export function hookStatus(run: Run) {
  return {
    ...readStatus(run.control),
    speed: run.clock.speed,
    wallMs: performance.now() - run.startedAt,
    finishedMs: run.finishedMs,
    failure: run.failure,
    audio: audioStatus(run),
  }
}
