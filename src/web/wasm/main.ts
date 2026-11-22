// The WebAssembly spike page (#35): wires the controls of wasm.html. It rebuilds the module from
// the user's dump with the module patch, turns the picked replay into its stream as the emulator
// page does, and runs the game in a worker (run.ts). The page allows the worker's frames by the
// tick rule (protocol.ts) and draws the newest whole frame (frame-swap.ts) on each animation
// frame. The game's sound goes from the worker through the audio ring to an audio worklet
// (audio.ts), at 1x and 2x; fast stays silent. The dump stays in this tab.
import { environmentProblem } from '../environment'
import { messageOf } from '../message'
import { FIRST_REPLAY, TEST_REPLAYS } from '../replays'
import { endedLine } from '../status'
import { streamOfReplay } from '../stream'
import { FRAME_HEIGHT, FRAME_WIDTH } from './frame'
import { readFrame } from './frame-swap'
import { grant, readStatus, type Speed, writePace } from './protocol'
import {
  AudioOpener,
  type Built,
  buildModule,
  hookStatus,
  type Picked,
  progressLine,
  reachEnd,
  type Run,
  runningLine,
  type Sound,
  startRun,
  stopRun,
  watchRun,
} from './run'
import { Runs } from './runs'
import { findSpikeView, type SpikeView } from './view'

/** A run with the id of the replay it plays, for the status line at END. */
type NamedRun = Run & { readonly id: string }

/** The animation-frame loop: grants the run its frames, draws the newest and shows the progress. */
function drawLoop(
  view: SpikeView,
  runs: Runs<NamedRun>,
  changeSpeed: (speed: Speed) => void,
): void {
  const context = view.canvas.getContext('2d')
  const image = new ImageData(FRAME_WIDTH, FRAME_HEIGHT)
  const draw = (now: number) => {
    requestAnimationFrame(draw)
    const run = runs.current
    if (run === undefined) return
    grant(run.control, run.clock.allowed(now))
    const status = readStatus(run.control)
    if (status.finished && run.finishedMs === undefined) {
      // At END fast gives way to 1x (speedAtEnd), and the speed control shows it.
      const speed = reachEnd(run, now)
      // The draw loop looks at the current run only, so a later Start never gets this line.
      view.status(endedLine(run.id))
      if (speed !== run.clock.speed) {
        changeSpeed(speed)
        view.showSpeed(speed)
      }
    }
    readFrame(run.control, run.frames, image.data)
    context?.putImageData(image, 0, 0)
    view.progress(progressLine(status, run))
  }
  requestAnimationFrame(draw)
  // A hidden tab gets no animation frame, so the game pauses; back in view, it goes on from there.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') runs.current?.clock.resume(performance.now())
  })
}

/** The page's state and its actions; the view's events call them. */
function createSpike(view: SpikeView) {
  let built: Promise<Built> | undefined
  let picked: Promise<Picked> | undefined
  let last: Picked | undefined
  const runs = new Runs<NamedRun>(stopRun)
  const audio = new AudioOpener()

  const changeSpeed = (speed: Speed) => {
    const run = runs.current
    if (run === undefined) return
    run.clock.change(speed, performance.now(), readStatus(run.control).frame)
    writePace(run.control, speed)
  }
  drawLoop(view, runs, changeSpeed)

  const begin = (module: Built, chosen: Picked, sound: Sound): Run => {
    const run = Object.assign(startRun(module, chosen, view.speed(), sound), { id: chosen.id })
    watchRun(run, (line) => {
      if (runs.current === run) view.status(line)
    })
    runs.replace(run)
    return run
  }

  const play = async (stream?: Picked): Promise<string | undefined> => {
    const ticket = runs.nextPlay()
    const [module, chosen, sound] = await Promise.all([built, stream ?? picked, audio.open()])
    if (module === undefined) throw new Error('Pick your US Emerald dump first, then press Start.')
    if (chosen === undefined) throw new Error('Pick a replay first, then press Start.')
    // A later Start or Restart came while this one waited; that one runs.
    if (!runs.isNewest(ticket)) return undefined
    last = chosen
    return runningLine(chosen, begin(module, chosen, sound))
  }

  return {
    // The build starts before the file is read, so a Start during the read waits for it too. A
    // run that started meanwhile keeps its line.
    pickDump: (dump: Blob) => {
      const mark = runs.mark()
      built = dump.arrayBuffer().then((bytes) => buildModule(new Uint8Array(bytes)))
      return built.then(({ bytes }) =>
        runs.startedSince(mark)
          ? undefined
          : `Your dump is US Emerald, and the page built the module (${String(bytes)} bytes). Press Start.`,
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
    changeSpeed,
    /** The test hook of e2e/wasm-spike.spec.ts: the run's status, its sound and the run counts. */
    status: () =>
      runs.current === undefined ? undefined : { ...hookStatus(runs.current), runs: runs.counts },
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
    act(view, () => spike.pickDump(file))
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
const problem = environmentProblem({ isSecureContext, crossOriginIsolated }, 'the game')
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
