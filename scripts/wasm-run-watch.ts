// The shot tool's loop (Play and TakeShots in rom/gen3/shot/replay_shot.c) for wasm:run: it
// watches the module's progress one frame at a time, takes the shots and says when the run ends.
import type { Progress } from '../src/web/wasm/progress.ts'
import type { Frame } from './rom-shot-probes.ts'
import type { ToolOutput } from './rom-shot-run.ts'
import type { Scene } from './rom-shot-scenes.ts'

// The rules of the shot tool's run (replay_shot.c): a stall is this many frames on one op, and a
// refused run ends this many frames after the error, with the refusal screen up.
export const STALL_FRAMES = 3600
const ERROR_FRAMES = 30

type Shot = Scene['shots'][number]
type Status = ToolOutput['status']

/** The shot tool's loop (Play and TakeShots in replay_shot.c), one frame at a time. */
export class Watch {
  frame = 0
  finishedAt: number | undefined
  readonly lines: ToolOutput['shots'] = []
  readonly frames = new Map<string, Frame>()
  private readonly due = new Map<string, number>()
  private lastDone = 0
  private lastChange = 0
  private errorFrame = 0

  private readonly shots: readonly Shot[]

  constructor(shots: readonly Shot[]) {
    this.shots = shots
  }

  /** Takes the shots due on this frame; returns the status when the run ends on it. */
  step(progress: Progress, frame: () => Frame): Status['status'] | undefined {
    this.frame++
    this.takeShots(progress, frame)
    this.noteFirsts(progress)
    if (this.errorFrame !== 0 && this.frame - this.errorFrame >= ERROR_FRAMES) return 'error'
    if (progress.finished && !this.shotsDue()) return 'finished'
    if (progress.done !== this.lastDone) {
      this.lastDone = progress.done
      this.lastChange = this.frame
    }
    return this.frame - this.lastChange >= STALL_FRAMES ? 'stall' : undefined
  }

  private noteFirsts(progress: Progress): void {
    if (progress.finished && this.finishedAt === undefined) this.finishedAt = this.frame
    if (progress.error !== 0 && this.errorFrame === 0) this.errorFrame = this.frame
  }

  private takeShots(progress: Progress, frame: () => Frame): void {
    for (const shot of this.shots) {
      if (!this.due.has(shot.name) && progress.playing && progress.done === shot.done) {
        this.due.set(shot.name, this.frame + shot.frames)
      }
      if (this.due.get(shot.name) !== this.frame || this.frames.has(shot.name)) continue
      this.frames.set(shot.name, frame())
      this.lines.push({ shot: shot.name, frame: this.frame, done: progress.done })
    }
  }

  private shotsDue(): boolean {
    return this.shots.some((shot) => this.due.has(shot.name) && !this.frames.has(shot.name))
  }
}
