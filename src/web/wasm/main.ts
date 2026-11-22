// The WebAssembly spike page (#35): wires the controls of wasm.html. It rebuilds the module from
// the user's dump with the module patch, turns the picked replay into its stream as the emulator
// page does, and runs the game in a worker. The page allows the worker's frames by the tick rule
// (protocol.ts) and draws the newest frame on each animation frame. The game's sound goes from
// the worker through the audio ring to an audio worklet (audio.ts), at 1x and 2x; fast stays
// silent. The dump stays in this tab.
import { applyBps } from '../../patch/bps-apply'
import type { SlotDescription } from '../../patch/slot'
import { environmentProblem } from '../environment'
import { fetchBytes, fetchJson } from '../fetch'
import { messageOf } from '../message'
import { FIRST_REPLAY, TEST_REPLAYS } from '../replays'
import { checkBaseRom, readSlotDescription } from '../rom'
import { ROM_FILES } from '../rom-files'
import { streamOfReplay } from '../stream'
import { AUDIO_PROCESSOR, AUDIO_STOP, AudioMeter, type AudioProcessorOptions } from './audio'
import workletUrl from './audio-worklet.ts?worker&url'
import { WASM_FILES } from './files'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame'
import type { StartMessage, WorkerReport } from './messages'
import {
  createShared,
  grant,
  MIXER_RATE,
  readStatus,
  type RunStatus,
  type Speed,
  TickClock,
  writePace,
} from './protocol'
import { AudioRing } from './ring'
import { findSpikeView, type SpikeView } from './view'

// About 1.56 s of the game's sound, left and right: the ring takes a power of two (ring.ts).
const AUDIO_CAPACITY = 2 ** 17
// The latency cap: at most 0.2 s of sound waits in the ring. Past it, the worklet skips the oldest
// samples down to 0.1 s, so a worker that writes faster than the audio clock plays stays in step.
const AUDIO_LATENCY = 2 * Math.round(MIXER_RATE / 5)
// The newest samples the test hook measures: about a tenth of a second.
const MEASURED_SAMPLES = 8192

interface Built {
  readonly module: WebAssembly.Module
  readonly slot: SlotDescription
  readonly bytes: number
}

interface Picked {
  readonly id: string
  readonly stream: Uint8Array
}

/** One run of the game: its worker, its shared buffers and its clock. */
interface Run {
  readonly worker: Worker
  readonly control: Int32Array
  readonly frame: Uint8Array
  readonly clock: TickClock
  readonly ring: AudioRing
  readonly output: AudioWorkletNode
  readonly startedAt: number
  finishedMs: number | undefined
}

async function buildModule(dump: Uint8Array): Promise<Built> {
  await checkBaseRom(dump)
  const [patch, json] = await Promise.all([fetchBytes(WASM_FILES.patch), fetchJson(ROM_FILES.slot)])
  const bytes = applyBps(patch, dump)
  const module = await WebAssembly.compile(bytes as Uint8Array<ArrayBuffer>)
  return { module, slot: readSlotDescription(json), bytes: bytes.length }
}

/** The page's one audio context, with the worklet loaded. */
async function openAudio(): Promise<AudioContext> {
  const context = new AudioContext()
  await context.audioWorklet.addModule(workletUrl)
  return context
}

/** The run's sound: a processor that plays the ring into the context. */
function connectRing(context: AudioContext, ring: SharedArrayBuffer): AudioWorkletNode {
  const processorOptions: AudioProcessorOptions = { ring, rate: MIXER_RATE, latency: AUDIO_LATENCY }
  const node = new AudioWorkletNode(context, AUDIO_PROCESSOR, {
    numberOfInputs: 0,
    outputChannelCount: [2],
    processorOptions,
  })
  node.connect(context.destination)
  return node
}

function startRun(
  built: Built,
  picked: Picked,
  setting: { speed: Speed; audio: AudioContext },
  onReport: (r: WorkerReport) => void,
) {
  const { speed, audio } = setting
  const buffers = createShared(AUDIO_CAPACITY)
  writePace(new Int32Array(buffers.control), speed)
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<WorkerReport>) => {
    onReport(event.data)
  }
  worker.onerror = (event) => {
    onReport({ type: 'failed', line: `The worker failed: ${event.message}` })
  }
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
  const run: Run = {
    worker,
    control: new Int32Array(buffers.control),
    frame: new Uint8Array(buffers.frame),
    clock: new TickClock(speed, now),
    ring: new AudioRing(buffers.audio),
    output: connectRing(audio, buffers.audio),
    startedAt: now,
    finishedMs: undefined,
  }
  return run
}

const progressLine = (status: RunStatus, run: Run): string => {
  const finished =
    run.finishedMs === undefined
      ? ''
      : ` Finished at frame ${String(status.finishedAt)} after ${(run.finishedMs / 1000).toFixed(1)} s.`
  return `Frame ${String(status.frame)}, instruction ${String(status.done)} of ${String(status.total)}, turn ${String(status.turn)}.${finished}`
}

/** The page's state and its actions; the view's events call them. */
function createSpike(view: SpikeView) {
  let built: Promise<Built> | undefined
  let picked: Promise<Picked> | undefined
  let run: Run | undefined
  let last: Picked | undefined
  let audio: Promise<AudioContext> | undefined
  const context = view.canvas.getContext('2d')
  const image = new ImageData(FRAME_WIDTH, FRAME_HEIGHT)

  const draw = (now: number) => {
    requestAnimationFrame(draw)
    if (run === undefined) return
    grant(run.control, run.clock.allowed(now))
    const status = readStatus(run.control)
    if (status.finished && run.finishedMs === undefined) run.finishedMs = now - run.startedAt
    image.data.set(run.frame)
    context?.putImageData(image, 0, 0)
    view.progress(progressLine(status, run))
  }
  requestAnimationFrame(draw)

  const play = async (stream?: Picked): Promise<string> => {
    // Start is the user's gesture that lets the page open its audio.
    audio ??= openAudio()
    const [module, chosen, context] = await Promise.all([built, stream ?? picked, audio])
    if (module === undefined) throw new Error('Pick your US Emerald dump first, then press Start.')
    if (chosen === undefined) throw new Error('Pick a replay first, then press Start.')
    run?.worker.terminate()
    run?.output.port.postMessage(AUDIO_STOP)
    run?.output.disconnect()
    last = chosen
    await context.resume()
    run = startRun(module, chosen, { speed: view.speed(), audio: context }, (report) => {
      if (report.type === 'failed') view.status(report.line)
    })
    return `Running ${chosen.id}: ${String(chosen.stream.length)} bytes of instruction stream.`
  }

  return {
    pickDump: (dump: Uint8Array) => {
      built = buildModule(dump)
      return built.then(
        ({ bytes }) =>
          `Your dump is US Emerald, and the page built the module (${String(bytes)} bytes). Press Start.`,
      )
    },
    pickReplay: (id: string) => {
      const replay = TEST_REPLAYS.find((test) => test.id === id)
      if (replay === undefined) return
      picked = replay.load().then((json) => ({ id, stream: streamOfReplay(json).stream.bytes }))
    },
    play,
    /** The stream that ran last, from its start; the picked replay when none ran yet. */
    restart: () => play(last),
    changeSpeed: (speed: Speed) => {
      if (run === undefined) return
      run.clock.change(speed, performance.now(), readStatus(run.control).frame)
      writePace(run.control, speed)
    },
    /** The test hook of e2e/wasm-spike.spec.ts: the run's status and its wall time so far. */
    status: () => (run === undefined ? undefined : hookStatus(run)),
  }
}

/** The sound's numbers for the test hook: what went through the ring and how loud it was. */
function audioStatus(run: Run) {
  const recent = new Float32Array(MEASURED_SAMPLES)
  const meter = new AudioMeter()
  meter.add(recent.subarray(recent.length - run.ring.recent(recent)))
  return {
    written: run.ring.totalWritten,
    read: run.ring.totalRead,
    overruns: run.ring.overruns,
    rms: meter.rms,
    rate: run.output.context.sampleRate,
    state: (run.output.context as AudioContext).state,
  }
}

function hookStatus(run: Run) {
  return {
    ...readStatus(run.control),
    wallMs: performance.now() - run.startedAt,
    finishedMs: run.finishedMs,
    audio: audioStatus(run),
  }
}

type Spike = ReturnType<typeof createSpike>

/** Runs a handler's work; its line or its failure becomes the status line. */
function act(view: SpikeView, work: () => Promise<string | undefined>): void {
  work().then(
    (line) => {
      if (line !== undefined) view.status(line)
    },
    (error: unknown) => {
      view.status(messageOf(error))
    },
  )
}

function wire(spike: Spike, view: SpikeView): void {
  view.dump.addEventListener('change', () => {
    const file = view.dump.files?.[0]
    if (file === undefined) return
    view.status('Checking your dump and building the module. This takes a few seconds.')
    act(view, async () => spike.pickDump(new Uint8Array(await file.arrayBuffer())))
  })
  view.testReplay.addEventListener('change', () => {
    spike.pickReplay(view.testReplay.value)
    view.status(`Picked ${view.testReplay.value}. Press Start to play it.`)
  })
  view.start.addEventListener('click', () => {
    act(view, () => spike.play())
  })
  view.restart.addEventListener('click', () => {
    act(view, () => spike.restart())
  })
  view.onSpeed((speed) => {
    spike.changeSpeed(speed)
  })
  view.offer(
    TEST_REPLAYS.map((test) => test.id),
    FIRST_REPLAY,
  )
  spike.pickReplay(FIRST_REPLAY)
}

const view = findSpikeView()
const problem = environmentProblem({ isSecureContext, crossOriginIsolated })
if (problem === undefined) {
  const spike = createSpike(view)
  wire(spike, view)
  view.status('Pick your US Emerald dump, then press Start.')
  // The e2e plays a stream of its own (the hand-made battle) and reads the run's status.
  Object.assign(window, {
    irvWasmSpike: {
      play: (id: string, bytes: number[]) => spike.play({ id, stream: Uint8Array.from(bytes) }),
      status: spike.status,
    },
  })
} else {
  view.showOnly(problem)
}
