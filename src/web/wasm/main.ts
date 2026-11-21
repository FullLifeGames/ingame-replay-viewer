// The WebAssembly spike page (#35): wires the controls of wasm.html. It rebuilds the module from
// the user's dump with the module patch, turns the picked replay into its stream as the emulator
// page does, and runs the game in a worker. The page allows the worker's frames by the tick rule
// (protocol.ts) and draws the newest frame on each animation frame. The dump stays in this tab.
import { applyBps } from '../../patch/bps-apply'
import type { SlotDescription } from '../../patch/slot'
import { environmentProblem } from '../environment'
import { fetchBytes, fetchJson } from '../fetch'
import { messageOf } from '../message'
import { FIRST_REPLAY, TEST_REPLAYS } from '../replays'
import { checkBaseRom, readSlotDescription } from '../rom'
import { ROM_FILES } from '../rom-files'
import { streamOfReplay } from '../stream'
import { WASM_FILES } from './files'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame'
import type { StartMessage, WorkerReport } from './messages'
import { createShared, grant, readStatus, type RunStatus, type Speed, TickClock } from './protocol'
import { findSpikeView, type SpikeView } from './view'

// The ring is unused until the game has sound; one second at the mixer's 42 kHz.
const AUDIO_CAPACITY = 42_048

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

function startRun(built: Built, picked: Picked, speed: Speed, onReport: (r: WorkerReport) => void) {
  const buffers = createShared(AUDIO_CAPACITY)
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
    const [module, chosen] = await Promise.all([built, stream ?? picked])
    if (module === undefined) throw new Error('Pick your US Emerald dump first, then press Start.')
    if (chosen === undefined) throw new Error('Pick a replay first, then press Start.')
    run?.worker.terminate()
    last = chosen
    run = startRun(module, chosen, view.speed(), (report) => {
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
      if (run !== undefined)
        run.clock.change(speed, performance.now(), readStatus(run.control).frame)
    },
    /** The test hook of e2e/wasm-spike.spec.ts: the run's status and its wall time so far. */
    status: () =>
      run === undefined
        ? undefined
        : {
            ...readStatus(run.control),
            wallMs: performance.now() - run.startedAt,
            finishedMs: run.finishedMs,
          },
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
