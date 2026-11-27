// The Gen 5 page plays a test replay by itself (#111): on the pick, before the emulator starts,
// it loads the build files and the replay and queues the direct entry from boot; once the entry
// stands at the action menu it reads the player's adapter and queues the play MOMENT_GAP frames
// after the mark battle (src/gen5/replay-run.ts); at the play's end it says how the battle ended,
// or where the play stopped. A run queued from outside wins (lane plan D14), a save in the address
// is refused (D15), and a waiting block marks its first frame alone unless `?every=` asks (D8).
// The hook, RAM, the status line, the build files and the timer come in as parameters.
import type { Bw2Numbers } from '../../gen5/bw2-numbers.ts'
import type { Gen5Hook, ReplayProgress, RunPlan, RunReport } from '../../gen5/hook.ts'
import { entryRun, playerAdapter, playRun } from '../../gen5/replay-run.ts'
import type { RoutineBuild } from '../../gen5/routine-order.ts'
import { saveName, saveQueryProblem } from '../../gen5/save-file.ts'
import { type LoadedReplay, loadReplay } from './replay-load.ts'
import {
  endLine,
  entryFailedLine,
  everyRefused,
  loadFailedLine,
  loadingLine,
  OUTSIDE_RUN,
  playingLine,
  SAVE_REFUSED,
  stoppedLine,
} from './replay-words.ts'

type BuildFiles = { numbers: Bw2Numbers; routine: RoutineBuild } | { problem: string }

export interface PlayerDeps {
  hook: Pick<Gen5Hook, 'queueRun' | 'runReport'> & {
    onRunEnd: (listener: (report: RunReport) => void) => void
  }
  read32: (address: number) => number
  say: (text: string) => void
  buildFiles: () => Promise<BuildFiles>
  /** Calls `tick` once a second until the returned function stops it. */
  repeat: (tick: () => void) => () => void
  /** Hears the end line once, at the play's end, for the list beside the game. */
  ended?: (line: string) => void
}

/** A test replay as the picker offers it. */
export interface ReplayChoice {
  readonly id: string
  readonly label: string
  readonly load: () => Promise<unknown>
}

/** The address's `?every=`: undefined without one, the number of frames, or the refusal. */
function everyOf(search: string): number | undefined | { problem: string } {
  const value = new URLSearchParams(search).get('every')
  if (value === null) return undefined
  return /^[1-9]\d*$/.test(value) ? Number(value) : { problem: everyRefused(value) }
}

/** What a play needs once the replay is loaded. */
interface Loaded extends LoadedReplay {
  choice: ReplayChoice
  numbers: Bw2Numbers
  every: number | undefined
}

/** The blocks begun at each step of the play, and each block by its name. */
function blockIndex(plan: RunPlan, loaded: Loaded) {
  const byName = new Map(loaded.replay.blocks.map((block) => [block.name, block]))
  let begun = 0
  const begunAt = plan.steps.map((step) => {
    if (step.kind === 'write' && byName.has(step.name)) begun += 1
    return begun
  })
  return { byName, begunAt }
}

class ReplayPlayer {
  progress: ReplayProgress | undefined
  loaded: Loaded | undefined
  private play: (RunPlan & ReturnType<typeof blockIndex>) | undefined
  private stopTicks: (() => void) | undefined
  private readonly deps: PlayerDeps

  constructor(deps: PlayerDeps) {
    this.deps = deps
    deps.hook.onRunEnd((report) => {
      this.onRunEnd(report)
    })
  }

  /** True when the emulator may start: with the entry queued, or with a run from outside. */
  async start(choice: ReplayChoice, search: string): Promise<boolean> {
    const every = everyOf(search)
    if (saveName(search) !== undefined || saveQueryProblem(search) !== undefined) {
      return this.stop(SAVE_REFUSED)
    }
    if (typeof every === 'object') return this.stop(every.problem)
    if (this.deps.hook.runReport().status === 'queued') {
      this.deps.say(OUTSIDE_RUN)
      return true
    }
    this.progress = { phase: 'loading', replay: choice.id, block: 0, blocks: 0 }
    this.deps.say(loadingLine(choice.label))
    const files = await this.deps.buildFiles()
    if ('problem' in files) return this.stop(files.problem)
    try {
      const replay = loadReplay(await choice.load(), files.numbers)
      const entry = entryRun(replay.replay, files.numbers, files.routine)
      this.deps.hook.queueRun(entry.plan)
      this.loaded = { ...replay, choice, numbers: files.numbers, every }
    } catch (error) {
      return this.stop(loadFailedLine(choice.label, (error as Error).message))
    }
    this.progress = { ...this.progress, phase: 'entry', blocks: this.loaded.replay.blocks.length }
    return true
  }

  /** Says why the replay stopped; false, so the emulator does not start for it. */
  private stop(failed: string): false {
    this.stopTicks?.()
    if (this.progress !== undefined) this.progress = { ...this.progress, phase: 'failed', failed }
    this.deps.say(failed)
    return false
  }

  private onRunEnd(report: RunReport): void {
    const phase = this.progress?.phase
    if (phase === 'entry') this.entryEnded(report)
    else if (phase === 'play') this.playEnded(report)
  }

  private entryEnded(report: RunReport): void {
    const loaded = this.loaded
    if (loaded === undefined) return
    if (report.status === 'failed') {
      this.stop(entryFailedLine(String(report.failed)))
      return
    }
    try {
      const adapter = playerAdapter(loaded.numbers, this.deps.read32)
      const { every } = loaded
      const plan = playRun(loaded.replay, loaded.numbers, { adapter, marks: report.marks, every })
      this.play = { ...plan, ...blockIndex(plan, loaded) }
      this.deps.hook.queueRun(plan)
    } catch (error) {
      this.stop(entryFailedLine((error as Error).message))
      return
    }
    this.setPhase('play', 0)
    this.stopTicks = this.deps.repeat(() => {
      this.tick()
    })
  }

  /** Says the block in hand, from the step the play is at. */
  private tick(): void {
    const block = this.play?.begunAt[this.deps.hook.runReport().step] ?? 0
    this.setPhase('play', block)
    const { loaded, progress } = this
    if (loaded && progress) this.deps.say(playingLine(loaded.choice.label, block, progress.blocks))
  }

  private setPhase(phase: ReplayProgress['phase'], block: number): void {
    if (this.progress !== undefined) this.progress = { ...this.progress, phase, block }
  }

  private playEnded(report: RunReport): void {
    this.stopTicks?.()
    const { loaded, play } = this
    if (loaded === undefined || play === undefined) return
    if (report.status === 'done') {
      this.setPhase('ended', loaded.replay.blocks.length)
      const line = endLine(loaded.end)
      this.deps.say(line)
      this.deps.ended?.(line)
      return
    }
    const step = play.steps[report.step]
    const block = step !== undefined && 'name' in step ? play.byName.get(step.name) : undefined
    this.setPhase('failed', play.begunAt[report.step] ?? 0)
    this.stop(stoppedLine(block, String(report.failed)))
  }
}

/** The page's player of test replays; `start` runs on the pick, before the emulator starts.
 * `loaded` gives the replay, its end and its lines once the entry is queued, for the list. */
export function replayPlayer(deps: PlayerDeps): {
  start: (choice: ReplayChoice, search: string) => Promise<boolean>
  progress: () => ReplayProgress | undefined
  loaded: () => LoadedReplay | undefined
} {
  const player = new ReplayPlayer(deps)
  return {
    start: (choice, search) => player.start(choice, search),
    progress: () => player.progress,
    loaded: () => {
      const loaded = player.loaded
      return loaded && { replay: loaded.replay, end: loaded.end, lines: loaded.lines }
    },
  }
}
