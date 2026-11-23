// The viewer (#35): wires the controls of index.html. It rebuilds the module from
// the user's dump with the module patch, picks a test replay or loads one by link or ID and lists
// what the game does not show, as the emulator page does (replay-choice.ts, replay-view.ts), and
// runs the picked stream in a worker (run.ts). The page allows the worker's frames by the
// tick rule (protocol.ts) and draws the newest whole frame (frame-swap.ts) on each animation
// frame. The game's sound goes from the worker through the audio ring to an audio worklet
// (audio.ts), at 1x and 2x; fast stays silent. The dump stays in this tab.
import { environmentProblem, startsModuleWorkers } from '../environment'
import { fetchJson } from '../fetch'
import { messageOf } from '../message'
import {
  createReplayChoice,
  PICK_DUMP,
  PICK_REPLAY,
  type ReplayChoice,
  type ReplaySummary,
  SessionError,
} from '../replay-choice'
import { wireReplayFile, wireReplays } from '../replay-view'
import { endedLine, panelText, READY_LINE } from '../status'
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

/** A pick with the summary the list shows for it; the hook's own stream has none. */
type ListedPick = Picked & { readonly summary?: ReplaySummary }

/** A run with the id of the replay it plays, for the status line at END, and its summary. */
type NamedRun = Run & { readonly id: string; readonly summary: ReplaySummary | undefined }

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
    // Before the run check, so a pick shows its names before the first Start.
    view.panel(
      panelText(
        view.shownReplay(),
        run && { summary: run.summary, turn: readStatus(run.control).turn },
      ),
    )
    if (run === undefined) return
    // The clock grants from the frame the game reached, so a game that fell behind never races.
    const status = readStatus(run.control)
    grant(run.control, run.clock.allowed(now, status.frame))
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

/** The newest pick's stream with its replay's id: what the list under the game describes. */
async function pickedStream(choice: ReplayChoice): Promise<ListedPick | undefined> {
  const chosen = await choice.chosen()
  return chosen === undefined
    ? undefined
    : { id: chosen.summary.id, stream: chosen.bytes, summary: chosen.summary }
}

/** The page's state and its actions; the view's events call them. */
function createSpike(view: SpikeView) {
  let built: Promise<Built> | undefined
  let last: ListedPick | undefined
  const choice = createReplayChoice(fetchJson)
  const runs = new Runs<NamedRun>(stopRun)
  const audio = new AudioOpener()

  const changeSpeed = (speed: Speed) => {
    const run = runs.current
    if (run === undefined) return
    run.clock.change(speed, performance.now(), readStatus(run.control).frame)
    writePace(run.control, speed)
  }
  drawLoop(view, runs, changeSpeed)

  const begin = (module: Built, chosen: ListedPick, sound: Sound): Run => {
    const { id, summary } = chosen
    const run = Object.assign(startRun(module, chosen, view.speed(), sound), { id, summary })
    watchRun(run, (line) => {
      if (runs.current === run) view.status(line)
    })
    runs.replace(run)
    return run
  }

  const play = async (stream?: ListedPick): Promise<string | undefined> => {
    const ticket = runs.nextPlay()
    const picked = stream ?? pickedStream(choice)
    const [module, chosen, sound] = await Promise.all([built, picked, audio.open()])
    if (module === undefined) throw new SessionError(PICK_DUMP)
    if (chosen === undefined) throw new SessionError(PICK_REPLAY)
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
    pickTestReplay: choice.pickTestReplay,
    loadReplay: choice.loadReplay,
    loadFile: choice.loadFile,
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
  view.start.addEventListener('click', () => {
    act(view, () => spike.play())
  })
  view.restart.addEventListener('click', () => {
    act(view, () => spike.restart())
  })
  view.onSpeed((speed) => {
    spike.changeSpeed(speed)
  })
  wireReplays(spike, view)
  wireReplayFile(spike, view)
}

const view = findSpikeView()
// The probe's URL loads nothing: the browser reads the options first (web.dev's check).
const moduleWorkers = startsModuleWorkers(
  typeof Worker === 'undefined' ? undefined : (options) => new Worker('blob://', options),
)
const problem = environmentProblem(
  { isSecureContext, crossOriginIsolated, moduleWorkers },
  'the game',
)
if (problem === undefined) {
  const spike = createSpike(view)
  wire(spike, view)
  view.status(READY_LINE)
  // The e2e plays a stream of its own (the hand-made battle) and reads the run's status.
  Object.assign(window, {
    irvWasmSpike: {
      play: (id: string, bytes: number[]) => spike.play({ id, stream: Uint8Array.from(bytes) }),
      status: spike.status,
    },
  })
} else {
  view.showOnly(problem.detail)
}
