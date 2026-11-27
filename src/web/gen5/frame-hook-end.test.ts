import { describe, expect, it } from 'vitest'

import type { RunPlan, RunReport } from '../../gen5/hook'
import type { MacroStep } from '../../gen5/macro'
import { MAIN_RAM_SIZE, MAIN_RAM_START, mainRamAt } from '../../gen5/main-ram'
import { type FrameGame, frameHook } from './frame-hook'

/** A core that counts frames; its state throws once `broken` is set. */
class CountingGame implements FrameGame {
  frame = 0
  broken = false
  readonly heap = new Uint8Array(MAIN_RAM_SIZE)

  getFrameNum(): number {
    return this.frame
  }
  simulateInput(): void {
    return undefined
  }
  getState(): Uint8Array {
    if (this.broken) throw new Error('no state')
    return new Uint8Array()
  }
  loadState(): void {
    return undefined
  }
  screenshot(): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array())
  }
}

function setup() {
  const game = new CountingGame()
  const ram = mainRamAt(() => game.heap, 0)
  const hook = frameHook(
    () => game,
    () => ram,
  )
  const heard: { status: string; failed?: string; frame: number }[] = []
  hook.onRunEnd((report: RunReport) => {
    heard.push({ status: report.status, frame: report.frame, ...pick(report) })
  })
  const iterate = (count = 1) => {
    for (let i = 0; i < count; i += 1) {
      hook.preMainLoop()
      game.frame += 1
    }
  }
  return { game, hook, heard, iterate }
}

const pick = (report: RunReport) => (report.failed === undefined ? {} : { failed: report.failed })

const plan = (steps: MacroStep[], more: Partial<RunPlan> = {}): RunPlan => ({
  steps,
  startFrame: 0,
  watch: [],
  ...more,
})
const begin: MacroStep = { kind: 'mark', name: 'begin' }
// An invented address in main RAM that stays 0, so the check never holds.
const never: MacroStep = {
  kind: 'until',
  name: 'never',
  checks: [{ name: 'flag', address: MAIN_RAM_START + 0x40, width: 1, oneOf: [1] }],
  holdFor: 1,
  limit: 2,
}

// Scene: the page chains the replay's entry and its play, so it must hear each run end once,
// with the report, and the run it queues then must start at its own frame.
describe('onRunEnd', () => {
  it('hears a run that ended done once, with the report', () => {
    const { hook, heard, iterate } = setup()
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 2 }, begin]))
    iterate(6)
    expect(heard).toEqual([{ status: 'done', frame: 2 }])
  })

  it('hears a run that failed once, with the reason', () => {
    const { hook, heard, iterate } = setup()
    hook.calls.queueRun(plan([never]))
    iterate(6)
    expect(heard).toEqual([
      {
        status: 'failed',
        frame: 2,
        failed: 'step 0 "never" did not hold within 2 frames; last: flag read 0x0, not one of 0x1',
      },
    ])
  })

  it('starts a run queued inside the listener at its startAt', () => {
    const { hook, iterate } = setup()
    hook.onRunEnd((report) => {
      if (report.marks.length === 1) {
        hook.calls.queueRun(plan([{ kind: 'mark', name: 'play' }], { startAt: report.frame + 3 }))
      }
    })
    hook.calls.queueRun(plan([begin]))
    iterate(8)
    expect(
      hook.calls.runReport().marks.map(({ name, frame }) => `${name} ${String(frame)}`),
    ).toEqual(['begin 0', 'play 3'])
  })

  it('hears a queued run that missed its frame', () => {
    const { hook, heard, iterate } = setup()
    iterate(5)
    hook.calls.queueRun(plan([begin], { startAt: 2 }))
    iterate()
    expect(heard).toEqual([
      {
        status: 'failed',
        frame: 5,
        failed: 'the run was to start at frame 2, and the hook first saw frame 5',
      },
    ])
  })

  it('hears a run the frame hook stopped by a throw', () => {
    const { game, hook, heard, iterate } = setup()
    game.broken = true
    hook.calls.queueRun(plan([begin]))
    iterate(3)
    expect(heard).toEqual([
      { status: 'failed', frame: 0, failed: 'the frame hook threw: Error: no state' },
    ])
  })

  it('counts the steps of a queued run from 0', () => {
    const { hook, iterate } = setup()
    hook.calls.queueRun(plan([{ kind: 'wait', frames: 3 }, begin]))
    iterate(6)
    hook.calls.queueRun(plan([begin], { startAt: 20 }))
    expect(hook.calls.runReport()).toMatchObject({ status: 'queued', step: 0 })
  })
})
