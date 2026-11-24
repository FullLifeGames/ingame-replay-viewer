// The Gen 5 spike's input macro (#72): a list of steps that the page plays one emulated frame at a
// time, from boot into the first battle (src/gen5/route.ts). A macro counts frames, never seconds,
// so a slow device plays the same inputs at the same frames. Pure: the page asks the player once
// per emulated frame, hands it a RAM reader for the `until` steps and turns its buttons into the
// core's input (src/web/gen5/frame-hook.ts); scripts/gen5-route.ts cuts the route at its marks.
import { failingCheck, type RamCheck, type ReadRam } from './ram-check.ts'
import type { MemoryWrite } from './ram-write.ts'

/** libretro's RetroPad indices (RETRO_DEVICE_ID_JOYPAD_* in libretro.h), which EmulatorJS's
 * simulateInput takes and melonDS maps to the DS's buttons. */
export const BUTTON = {
  B: 0,
  Y: 1,
  Select: 2,
  Start: 3,
  Up: 4,
  Down: 5,
  Left: 6,
  Right: 7,
  A: 8,
  X: 9,
  L: 10,
  R: 11,
} as const

export type Button = keyof typeof BUTTON

/** Presses `buttons` for the first `hold` frames out of every `every`. */
interface Mash {
  buttons: readonly Button[]
  every: number
  hold: number
  /** Buttons held on every frame of the mash, beside the mashed ones. */
  held?: readonly Button[]
}

export type MacroStep =
  | { kind: 'wait'; frames: number }
  | { kind: 'press'; buttons: readonly Button[]; frames: number }
  | { kind: 'mash'; frames: number; mash: Mash }
  /** Waits (mashing, if given) until the checks held for `holdFor` frames in a row; fails the
   * macro after `limit` frames. */
  | {
      kind: 'until'
      name: string
      checks: readonly RamCheck[]
      holdFor: number
      limit: number
      mash?: Mash
      /** Marks `<name>-001`, `<name>-002`, … every this many frames while it waits. */
      markEvery?: number
    }
  /** A milestone: takes no frame; the page saves a state and a frame there. */
  | { kind: 'mark'; name: string }
  /** Writes into main RAM: takes one frame, before which the page applies the writes. */
  | { kind: 'write'; name: string; writes: readonly MemoryWrite[] }

/** The buttons to hold through one frame, the marks reached before it, and where the macro is. */
export interface FrameInput {
  buttons: readonly Button[]
  marks: readonly string[]
  /** The step that gave this frame's input; the step count once the macro is done. */
  step: number
  done: boolean
  /** Why the macro stopped early: the step, its name and the last check that failed. */
  failed?: string
  /** A write step's writes, to apply before this frame runs. */
  writes?: readonly MemoryWrite[]
}

export interface MacroPlayer {
  /** The input of the next emulated frame; call it exactly once per frame. */
  next: (read: ReadRam) => FrameInput
}

type Outcome =
  | { kind: 'frame'; buttons: readonly Button[]; mark?: string; writes?: readonly MemoryWrite[] }
  | { kind: 'over' }
  | { kind: 'failed'; why: string }

interface Progress {
  /** Frames this step has given so far. */
  spent: number
  /** Frames in a row its checks held. */
  held: number
}

const mashed = (mash: Mash, frame: number): readonly Button[] => [
  ...(mash.held ?? []),
  ...(frame % mash.every < mash.hold ? mash.buttons : []),
]

type UntilStep = Extract<MacroStep, { kind: 'until' }>

function untilOutcome(step: UntilStep, progress: Progress, read: ReadRam): Outcome {
  const failing = failingCheck(step.checks, read)
  progress.held = failing === undefined ? progress.held + 1 : 0
  if (progress.held >= step.holdFor) return { kind: 'over' }
  if (progress.spent >= step.limit) {
    const why = `"${step.name}" did not hold within ${String(step.limit)} frames; last: ${failing ?? 'held too briefly'}`
    return { kind: 'failed', why }
  }
  const buttons = step.mash ? mashed(step.mash, progress.spent) : []
  const every = step.markEvery
  if (every === undefined || progress.spent % every !== 0) return { kind: 'frame', buttons }
  const count = String(progress.spent / every + 1).padStart(3, '0')
  return { kind: 'frame', buttons, mark: `${step.name}-${count}` }
}

function outcomeOf(step: MacroStep, progress: Progress, read: ReadRam): Outcome {
  if (step.kind === 'mark') return { kind: 'over' }
  if (step.kind === 'write') {
    return progress.spent === 0
      ? { kind: 'frame', buttons: [], writes: step.writes }
      : { kind: 'over' }
  }
  if (step.kind === 'until') return untilOutcome(step, progress, read)
  if (progress.spent >= step.frames) return { kind: 'over' }
  if (step.kind === 'wait') return { kind: 'frame', buttons: [] }
  if (step.kind === 'press') return { kind: 'frame', buttons: step.buttons }
  return { kind: 'frame', buttons: mashed(step.mash, progress.spent) }
}

export function macroPlayer(steps: readonly MacroStep[]): MacroPlayer {
  let index = 0
  let progress: Progress = { spent: 0, held: 0 }
  let failed: string | undefined
  const end = (marks: readonly string[]): FrameInput =>
    failed === undefined
      ? { buttons: [], marks, step: index, done: true }
      : { buttons: [], marks, step: index, done: true, failed }
  return {
    next: (read) => {
      const marks: string[] = []
      for (let step = steps[index]; step && failed === undefined; step = steps[index]) {
        const outcome = outcomeOf(step, progress, read)
        if (outcome.kind === 'frame') {
          progress.spent += 1
          if (outcome.mark !== undefined) marks.push(outcome.mark)
          const input: FrameInput = { buttons: outcome.buttons, marks, step: index, done: false }
          return outcome.writes ? { ...input, writes: outcome.writes } : input
        }
        if (outcome.kind === 'failed') failed = `step ${String(index)} ${outcome.why}`
        else {
          if (step.kind === 'mark') marks.push(step.name)
          index += 1
          progress = { spent: 0, held: 0 }
        }
      }
      return end(marks)
    },
  }
}

function markIndex(steps: readonly MacroStep[], name: string): number {
  const at = steps.findIndex((step) => step.kind === 'mark' && step.name === name)
  if (at < 0) throw new Error(`The route has no mark "${name}".`)
  return at
}

/** The steps after the `from` mark (or from the start) up to and with the `to` mark (or to the
 * end): the part a run plays from a state saved at `from`. */
export function routeSlice(
  steps: readonly MacroStep[],
  from: string | undefined,
  to: string | undefined,
): MacroStep[] {
  const start = from === undefined ? 0 : markIndex(steps, from) + 1
  const stop = to === undefined ? steps.length : markIndex(steps, to) + 1
  if (stop < start) throw new Error(`The mark "${String(to)}" comes before "${String(from)}".`)
  return steps.slice(start, stop)
}

/** The core inputs that turn the held buttons `before` into `after`: releases first. */
export function buttonChanges(
  before: readonly Button[],
  after: readonly Button[],
): { index: number; value: 0 | 1 }[] {
  const released = before.filter((button) => !after.includes(button))
  const pressed = after.filter((button) => !before.includes(button))
  return [
    ...released.map((button) => ({ index: BUTTON[button], value: 0 as const })),
    ...pressed.map((button) => ({ index: BUTTON[button], value: 1 as const })),
  ]
}
