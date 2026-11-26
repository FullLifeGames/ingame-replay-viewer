// The spike page's frame hook (#72): one call before each iteration of the core's main loop, which
// plays a macro one emulated frame at a time (src/gen5/macro.ts), saves a state and a frame at each
// mark, logs the watched RAM values and gives the emulated frame that drives the page's fixed clock
// (src/gen5/clock.ts). core-runtime.ts hands the call to the core. RetroArch runs at most one core
// frame per iteration; the core's frame counter tells which iterations ran one, and the hook counts
// the frames it did not see.
import type { Gen5Hook, MarkRecord, RunPlan, RunReport } from '../../gen5/hook.ts'
import {
  type Button,
  buttonChanges,
  type FrameInput,
  type MacroPlayer,
  macroPlayer,
} from '../../gen5/macro.ts'
import { MAIN_RAM_SIZE, MAIN_RAM_START, type MainRam } from '../../gen5/main-ram.ts'
import { changedValues, readRef, type ReadRam } from '../../gen5/ram-check.ts'
import { type MemoryWrite, wordWrites } from '../../gen5/ram-write.ts'
import { fromBase64, sha256, toBase64 } from './codec.ts'

/** The part of EmulatorJS's game manager the hook calls. */
export interface FrameGame {
  getFrameNum(): number
  simulateInput(player: number, button: number, value: number): void
  getState(): Uint8Array
  loadState(state: Uint8Array): void
  screenshot(): Promise<Uint8Array>
}

type FrameHookCalls = Pick<Gen5Hook, 'queueRun' | 'runReport' | 'takeMark'>

/** Watch lines kept; the log needs the battle's start, not a flood. */
const WATCH_LINES = 400
/** A run from a state loads it once the core has run this many frames, so RetroArch is up. */
const LOAD_AFTER_FRAMES = 10

function readWidth(ram: MainRam, address: number, width: 1 | 2 | 4): number {
  if (width === 4) return ram.read32(address)
  const bytes = ram.read(address, width)
  return (bytes[0] ?? 0) + (width === 2 ? (bytes[1] ?? 0) * 256 : 0)
}

interface Run {
  plan: RunPlan
  player: MacroPlayer
  held: readonly Button[]
  /** The page's frame counter and the emulated frame at the run's first frame. */
  pageBase: number
  firstFrame: number
  watched: (number | undefined)[]
  begin: number
}

interface Capture {
  state: Uint8Array
  shot: Promise<Uint8Array>
}

/** The run's state between calls; each method is one part of a frame. */
class FrameDriver {
  readonly report: RunReport = {
    status: 'idle',
    frame: 0,
    step: 0,
    marks: [],
    watch: [],
    jumps: 0,
  }
  readonly captures = new Map<string, Capture>()
  queued: RunPlan | undefined
  frame = 0
  /** Emulated frame minus the page's frame counter; kept after a run ends, for the clock. */
  private offset = 0
  /** The page frame at which a state load was asked for. */
  private loadedAt: number | undefined
  /** The page frame of the last picture asked for, and its promise. */
  private lastShot: { page: number; shot: Promise<Uint8Array> } | undefined
  private run: Run | undefined
  private lastPage: number | undefined
  private readonly read: ReadRam

  private readonly game: () => FrameGame | undefined
  private readonly ram: () => MainRam

  constructor(game: () => FrameGame | undefined, ram: () => MainRam) {
    this.game = game
    this.ram = ram
    this.read = (address, width) => readWidth(ram(), address, width)
  }

  /** Emscripten's preMainLoop: true lets the iteration run. */
  preMainLoop(): boolean {
    const g = this.game()
    if (!g) return true
    const page = g.getFrameNum()
    if (page === this.lastPage) return true
    const skipped = this.lastPage === undefined ? 0 : Math.max(0, page - this.lastPage - 1)
    this.report.jumps += skipped
    this.lastPage = page
    try {
      this.onFrame(g, page, skipped)
    } catch (error) {
      this.report.status = 'failed'
      this.report.failed = `the frame hook threw: ${String(error)}`
      this.run = undefined
    }
    return true
  }

  private onFrame(g: FrameGame, page: number, skipped: number): void {
    const plan = this.queued
    const starting = plan !== undefined && this.ready(g, plan, page)
    if (plan && starting) this.start(plan, page)
    const run = this.run
    if (run) this.offset = run.firstFrame - run.pageBase
    this.frame = page + this.offset
    this.report.frame = this.frame
    if (run) this.step(g, run, page, starting ? 0 : skipped)
  }

  /** True when a queued run starts at this frame: at once from boot, or at its frame; from a
   * state at the first frame after the load, which waits until RetroArch is up. */
  private ready(g: FrameGame, plan: RunPlan, page: number): boolean {
    if (plan.state === undefined) return plan.startAt === undefined || this.due(plan.startAt, page)
    if (this.loadedAt !== undefined && page > this.loadedAt) {
      this.checkLoad(plan)
      return true
    }
    if (this.loadedAt === undefined && page >= LOAD_AFTER_FRAMES) this.load(g, plan.state, page)
    return false
  }

  /** True at the frame `startAt`; past it the queued run fails, as it can no longer start there. */
  private due(startAt: number, page: number): boolean {
    const frame = page + this.offset
    if (frame > startAt) {
      this.queued = undefined
      this.report.status = 'failed'
      this.report.failed = `the run was to start at frame ${String(startAt)}, and the hook first saw frame ${String(frame)}`
    }
    return frame === startAt
  }

  /** Loads a state; the run starts at the next frame the hook sees, once the load took hold. */
  private load(g: FrameGame, state: string, page: number): void {
    // A state in the heap holds a second copy of main RAM, so the scan runs before the load.
    this.ram()
    g.loadState(fromBase64(state))
    this.loadedAt = page
  }

  /** Compares main RAM after the load with the hash saved at the state's mark. */
  private checkLoad(plan: RunPlan): void {
    const now = this.ram().read(MAIN_RAM_START, MAIN_RAM_SIZE)
    void sha256(now).then((hash) => {
      const same = hash === plan.stateSha
      this.report.loadCheck = `main RAM after the load ${same ? 'equals' : 'DIFFERS FROM'} the mark's hash (${hash.slice(0, 12)})`
    })
  }

  private start(plan: RunPlan, page: number): void {
    this.run = {
      plan,
      player: macroPlayer(plan.steps),
      held: [],
      pageBase: page,
      firstFrame: plan.state === undefined ? page + this.offset : plan.startFrame,
      watched: [],
      begin: performance.now(),
    }
    this.queued = undefined
    this.report.status = 'running'
  }

  private step(g: FrameGame, run: Run, page: number, skipped: number): void {
    for (let i = 0; i < skipped; i += 1) {
      if (!this.applied(g, run, run.player.next(this.read), page)) return
    }
    const input = run.player.next(this.read)
    if (!this.applied(g, run, input, page)) return
    for (const name of input.marks) this.capture(g, name, page)
    for (const change of buttonChanges(run.held, input.buttons)) {
      g.simulateInput(0, change.index, change.value)
    }
    run.held = input.buttons
    this.report.step = input.step
    if (run.plan.steps[input.step]?.kind === 'until') this.watch(run)
    if (input.done) this.finish(g, run, input.failed, page)
  }

  /** A frame's writes, applied before it runs, also for a frame the hook did not see. A write
   * whose chain leaves main RAM fails the run at its step, as an `until` past its limit does,
   * and none of the step's later writes follow: false then. */
  private applied(g: FrameGame, run: Run, input: FrameInput, page: number): boolean {
    for (const write of input.writes ?? []) {
      const fault = this.apply(write)
      if (fault === undefined) continue
      const step = run.plan.steps[input.step]
      const name = step?.kind === 'write' ? `"${step.name}" ` : ''
      this.report.step = input.step
      for (const mark of input.marks) this.capture(g, mark, page)
      this.finish(g, run, `step ${String(input.step)} ${name}could not write ${fault}`, page)
      return false
    }
    return true
  }

  /** Writes `write` and logs its field, never a heap address; or gives its chain's fault. */
  private apply(write: MemoryWrite): string | undefined {
    const ram = this.ram()
    const words = wordWrites(write, ram.read32)
    if ('fault' in words) return words.fault
    for (const word of words.words) ram.write32(word.address, word.value)
    this.report.watch.push(`${String(this.frame)}: wrote ${write.field}`)
    return undefined
  }

  private watch(run: Run): void {
    const values = run.plan.watch.map((ref) => readRef(ref, this.read))
    const line = changedValues(run.plan.watch, run.watched, values)
    run.watched = values
    if (line !== '' && this.report.watch.length < WATCH_LINES) {
      this.report.watch.push(`${String(this.frame)}: ${line}`)
    }
  }

  private finish(g: FrameGame, run: Run, failed: string | undefined, page: number): void {
    for (const change of buttonChanges(run.held, [])) g.simulateInput(0, change.index, 0)
    if (failed !== undefined) {
      this.report.failed = failed
      this.capture(g, 'failed', page)
    }
    this.report.status = failed === undefined ? 'done' : 'failed'
    this.run = undefined
  }

  /** One picture per emulated frame. EmulatorJS's screenshot has the core write one file and
   * polls for it while the core runs on, so a picture shows the core's frame soon after the
   * mark's, not the mark's own, and it is the same picture for every mark of that frame. A
   * second request on the frame would picture a later one, set by wall time. Each request waits
   * for the one before, so pictures keep the frames' order. Keyed by the page's frame counter,
   * which `preMainLoop` sees once per core frame. */
  private shotOf(g: FrameGame, page: number): Promise<Uint8Array> {
    if (this.lastShot?.page === page) return this.lastShot.shot
    const before = this.lastShot?.shot ?? Promise.resolve()
    const shot = before.then(() => g.screenshot())
    this.lastShot = { page, shot }
    return shot
  }

  /** The plan's mark values read now, as `name=0x…`. */
  private markValues(): string {
    const refs = this.run?.plan.markRefs ?? []
    const none = refs.map(() => undefined)
    return changedValues(
      refs,
      none,
      refs.map((ref) => readRef(ref, this.read)),
    )
  }

  /** The state now, the frame's picture (see `shotOf`), and a hash of main RAM now. */
  private capture(g: FrameGame, name: string, page: number): void {
    // getState serializes main RAM into the heap: a second copy the scan would also find.
    const ramNow = this.ram().read(MAIN_RAM_START, MAIN_RAM_SIZE)
    const kept = this.run?.plan.stateMarks
    const state = kept === undefined || kept.includes(name) ? g.getState() : new Uint8Array()
    const shot = this.shotOf(g, page)
    this.captures.set(name, { state, shot })
    const record: MarkRecord = {
      name,
      frame: this.frame,
      pageFrame: page,
      wallMs: Math.round(performance.now() - (this.run?.begin ?? 0)),
      stateBytes: state.length,
      values: this.markValues(),
    }
    this.report.marks.push(record)
    void sha256(ramNow).then((hash) => {
      record.ramSha = hash
    })
  }
}

export function frameHook(
  game: () => FrameGame | undefined,
  ram: () => MainRam,
): { calls: FrameHookCalls; preMainLoop: () => boolean; frame: () => number } {
  const driver = new FrameDriver(game, ram)
  const calls: FrameHookCalls = {
    queueRun: (plan) => {
      driver.queued = plan
      driver.report.status = 'queued'
    },
    runReport: () => driver.report,
    takeMark: async (name) => {
      const taken = driver.captures.get(name)
      if (!taken) return undefined
      driver.captures.delete(name)
      return { state: toBase64(taken.state), shot: toBase64(await taken.shot) }
    },
  }
  return { calls, preMainLoop: () => driver.preMainLoop(), frame: () => driver.frame }
}
