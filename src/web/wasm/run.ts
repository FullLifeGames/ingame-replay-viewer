// One run of the game on the viewer (#35): the module built from the dump, the
// worker, the shared buffers, the tick clock and the sound. main.ts holds the page's state and
// starts and stops runs through this file. The e2e covers it, as it covers the page's wiring.
import { applyBps } from '../../patch/bps-apply'
import type { SlotDescription } from '../../patch/slot'
import { fetchBytes, fetchJson } from '../fetch'
import { checkBaseRom, readSlotDescription } from '../rom'
import { ROM_FILES } from '../rom-files'
import { AUDIO_PROCESSOR, AUDIO_STOP, AudioMeter, type AudioProcessorOptions } from './audio'
import { type Silence, silenceOf, type Sound } from './audio-opener'
import workletUrl from './audio-worklet.ts?worker&url'
import { TickClock } from './clock'
import { buildFailure, type FailedReport, RunFailure, workerFailure } from './failures'
import { WASM_FILES } from './files'
import type { StartMessage, WorkerReport } from './messages'
import type { Speakers } from './pause'
import {
  createShared,
  GBA_FRAMES_PER_SECOND,
  MIXER_RATE,
  readStatus,
  type Speed,
  speedAtEnd,
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
}

export interface Picked {
  readonly id: string
  readonly stream: Uint8Array
}

/** One run of the game: its worker, its shared buffers, its clock and its sound, if any. */
export interface Run {
  readonly worker: Worker
  readonly control: Int32Array
  /** The two frame buffers; the page reads them through readFrame (frame-swap.ts) only. */
  readonly frames: SharedArrayBuffer
  readonly clock: TickClock
  readonly ring: AudioRing
  readonly output: AudioWorkletNode | undefined
  /** The processor's link to the speakers, which a Start during the run's pause cuts first. */
  readonly speakers: Speakers
  /** Why the run plays without sound; undefined when it has sound. */
  readonly silence: Silence | undefined
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
    return { module, slot }
  } catch (error: unknown) {
    throw buildFailure(error)
  }
}

/** Opens the page's audio context with the worklet that plays the ring (AudioOpener's factory). */
export async function openAudioContext(): Promise<AudioContext> {
  const context = new AudioContext()
  await context.audioWorklet.addModule(workletUrl)
  return context
}

/** The run's sound: a processor that plays the ring into the context, or why there is none. */
function connectRing(sound: Sound, ring: SharedArrayBuffer) {
  if ('reason' in sound) return { output: undefined, silence: sound }
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
    return { output: undefined, silence: silenceOf('the audio worklet failed', error) }
  }
}

/** The processor's link to the speakers; nothing to cut for a run without sound. */
function speakersOf(output: AudioWorkletNode | undefined): Speakers {
  let muted = false
  return {
    get muted() {
      return muted
    },
    mute: () => {
      muted = true
      output?.disconnect()
    },
    unmute: () => {
      muted = false
      output?.connect(output.context.destination)
    },
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
    speakers: speakersOf(output),
    silence,
    startedAt: now,
    finishedMs: undefined,
    writtenToEnd: undefined,
    failure: undefined,
  }
}

/**
 * Keeps the worker's failure line in the run, for the test hook, and hands the failure to `show`.
 * An error event, a throw the worker did not catch, reads as the game's stop (S5-11).
 */
export function watchRun(run: Run, show: (failure: RunFailure) => void): void {
  const fail = (report: FailedReport) => {
    run.failure = report.line
    show(new RunFailure(report))
  }
  run.worker.onmessage = (event: MessageEvent<WorkerReport>) => {
    if (event.data.type === 'failed') fail(event.data)
  }
  run.worker.onerror = (event) => {
    fail(workerFailure(event.message))
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

/** The test hook's view of a run (e2e/wasm-play.spec.ts). */
export function hookStatus(run: Run) {
  return {
    ...readStatus(run.control),
    speed: run.clock.speed,
    paused: run.clock.paused,
    wallMs: performance.now() - run.startedAt,
    finishedMs: run.finishedMs,
    failure: run.failure,
    audio: audioStatus(run),
  }
}
