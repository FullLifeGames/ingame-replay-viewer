import { describe, expect, it } from 'vitest'

import { MAIN_RAM_SIZE, mainRamAt } from '../../gen5/main-ram'
import { type FrameGame, frameHook } from './frame-hook'

/** A core whose screenshot comes late, as EmulatorJS's does: the core writes the picture while it
 * runs on, and the page polls for the file. Each picture holds the number of its call. */
class SlowShots implements FrameGame {
  frame = 0
  readonly heap = new Uint8Array(MAIN_RAM_SIZE)
  /** What happened, in order: `ask <call> at <frame>` and `wrote <call>`. */
  readonly events: string[] = []
  private calls = 0
  private pending: (() => void)[] = []

  getFrameNum(): number {
    return this.frame
  }
  simulateInput(): void {
    return undefined
  }
  getState(): Uint8Array {
    return new Uint8Array()
  }
  loadState(): void {
    return undefined
  }
  screenshot(): Promise<Uint8Array> {
    this.calls += 1
    const call = this.calls
    this.events.push(`ask ${String(call)} at ${String(this.frame)}`)
    return new Promise((resolve) => {
      this.pending.push(() => {
        this.events.push(`wrote ${String(call)}`)
        resolve(Uint8Array.of(call))
      })
    })
  }
  /** Writes every picture asked for so far, then lets the page's promises run. */
  async write(): Promise<void> {
    const due = this.pending
    this.pending = []
    for (const done of due) done()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function setup() {
  const game = new SlowShots()
  const ram = mainRamAt(() => game.heap, 0)
  const hook = frameHook(
    () => game,
    () => ram,
  )
  /** One main-loop iteration: the hook, then one core frame, then the page's promises. */
  const iterate = async () => {
    hook.preMainLoop()
    game.frame += 1
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { game, hook, iterate }
}

// Scene: the moment script takes the picture of each mark. Two marks on one emulated frame (the
// direct run's `gone` and `battle-start-001`) must show the same picture; a second request for
// the second mark would picture whatever frame the core reached once the first file appeared.
describe('frameHook pictures', () => {
  it('asks once per emulated frame, gives every mark of that frame the same picture, and keeps the order across frames', async () => {
    const { game, hook, iterate } = setup()
    hook.calls.queueRun({
      steps: [
        { kind: 'mark', name: 'gone' },
        { kind: 'mark', name: 'battle-start-001' },
        { kind: 'wait', frames: 1 },
        { kind: 'mark', name: 'next' },
        { kind: 'wait', frames: 3 },
      ],
      startFrame: 0,
      watch: [],
    })
    await iterate()
    await iterate()
    await iterate()
    for (let i = 0; i < 4; i += 1) await game.write()
    const gone = await hook.calls.takeMark('gone')
    const start = await hook.calls.takeMark('battle-start-001')
    const next = await hook.calls.takeMark('next')
    expect(start?.shot).toBe(gone?.shot)
    expect(next?.shot).not.toBe(gone?.shot)
    expect(game.events).toEqual(['ask 1 at 1', 'wrote 1', 'ask 2 at 3', 'wrote 2'])
    expect(hook.calls.runReport().marks.map((mark) => [mark.name, mark.frame])).toEqual([
      ['gone', 0],
      ['battle-start-001', 0],
      ['next', 1],
    ])
  })
})
