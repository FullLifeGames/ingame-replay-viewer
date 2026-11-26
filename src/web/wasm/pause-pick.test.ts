import { describe, expect, it } from 'vitest'

import { AudioOpener } from './audio-opener'
import { TickClock } from './clock'
import { togglePause } from './pause'
import { createShared, writeStatus } from './protocol'

/** A run that plays at 1x; its game reports frame 40 of 34 instructions. */
function playing() {
  const clock = new TickClock('1x', 0)
  const control = new Int32Array(createShared(16).control)
  writeStatus(control, 40, {
    done: 3,
    total: 34,
    turn: 1,
    error: 0,
    finished: false,
    playing: true,
  })
  return { label: 'Gen 3: A vs B (hand-made)', clock, control, silence: undefined }
}

// #90 (D4): a pick during the pause shows "Picked …". A refused Play leaves that line in place; the
// next Start makes a run with a line of its own. The hook's own stream has no pick to keep.
describe('a refused Play while the page shows another pick', () => {
  const refusing = async () => {
    const context = { resume: () => Promise.resolve(), suspend: () => Promise.resolve() }
    const audio = new AudioOpener(() => Promise.resolve(context as unknown as AudioContext))
    await audio.open()
    return { context, audio }
  }
  const played = { id: 'played' }
  const picked = { id: 'picked' }

  it("gives no line, and the line again once the page shows the run's replay", async () => {
    const { context, audio } = await refusing()
    const run = { ...playing(), summary: played }
    await togglePause(run, audio, 1500, played)
    context.resume = () => Promise.reject(new Error('refused for the test'))
    await expect(togglePause(run, audio, 9000, picked)).resolves.toBeUndefined()
    expect(run.clock.paused).toBe(false)
    await togglePause(run, audio, 9500, played)
    await expect(togglePause(run, audio, 9800, played)).resolves.toMatchObject({
      detail: 'refused for the test',
    })
  })

  it('gives the line for a run without a pick of its own', async () => {
    const { context, audio } = await refusing()
    const run = playing()
    await togglePause(run, audio, 1500, picked)
    context.resume = () => Promise.reject(new Error('refused for the test'))
    await expect(togglePause(run, audio, 9000, picked)).resolves.toMatchObject({
      detail: 'refused for the test',
    })
  })
})
