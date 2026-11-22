// The runs of the WebAssembly spike page (#35): the current run, the counts the test hook reports,
// and which play may start a run. DOM-free, so a Node spec covers it; main.ts hands it the stop.

/** The page's current run, and the runs it started and stopped: one at most is live. */
export class Runs<R> {
  current: R | undefined
  private readonly stop: (run: R) => void
  private started = 0
  private stopped = 0
  private plays = 0

  constructor(stop: (run: R) => void) {
    this.stop = stop
  }

  /** A play's number. After its waits, only the newest play may start a run (isNewest). */
  nextPlay(): number {
    this.plays += 1
    return this.plays
  }

  isNewest(play: number): boolean {
    return play === this.plays
  }

  /** Stops the current run, if any, and makes `run` the current one. */
  replace(run: R): void {
    if (this.current !== undefined) {
      this.stop(this.current)
      this.stopped += 1
    }
    this.current = run
    this.started += 1
  }

  /** A mark for startedSince: a line that waits can check whether a run began meanwhile. */
  mark(): number {
    return this.started
  }

  startedSince(mark: number): boolean {
    return this.started !== mark
  }

  get counts() {
    return { started: this.started, live: this.started - this.stopped }
  }
}
