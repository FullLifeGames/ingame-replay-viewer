import { describe, expect, it } from 'vitest'

import { TickClock } from './clock'
import { type HeldRun, soundForPress } from './pause'
import { Runs } from './runs'

/** A run whose sound logs each move on or off the speakers; `paused` holds its clock at frame 40. */
function heldRun(log: string[], name: string, paused: boolean): HeldRun {
  const clock = new TickClock('1x', 0)
  if (paused) clock.pause(40)
  return {
    clock,
    speakers: {
      mute: () => log.push(`mute ${name}`),
      unmute: () => log.push(`unmute ${name}`),
    },
  }
}

/** A fake opener that logs its calls; the sound it opens is the line of a run without sound. */
function fakeAudio(log: string[]) {
  return {
    open: () => {
      log.push('open')
      return Promise.resolve('no sound in the spec')
    },
    suspend: () => {
      log.push('suspend')
      return Promise.resolve()
    },
  }
}

/** The page's runs with `current` in place, and the ticket of the press that follows. */
function pageWith(current: HeldRun) {
  const runs = new Runs<HeldRun>(() => undefined)
  runs.replace(current)
  return { runs, ticket: runs.nextPlay() }
}

// R39, #69: the context's resume would play the sound a paused run holds in its ring until the
// new run replaces that run.
describe('the sound of a Start or Restart during a pause', () => {
  it("takes the paused run's sound off the speakers before the new run's sound opens", async () => {
    const log: string[] = []
    const { runs, ticket } = pageWith(heldRun(log, 'old', true))
    await expect(soundForPress(runs, ticket, fakeAudio(log)).sound).resolves.toBe(
      'no sound in the spec',
    )
    expect(log).toEqual(['mute old', 'open'])
  })

  it("leaves a playing run's sound on the speakers", () => {
    const log: string[] = []
    const { runs, ticket } = pageWith(heldRun(log, 'old', false))
    void soundForPress(runs, ticket, fakeAudio(log))
    expect(log).toEqual(['open'])
  })

  it('opens the sound alone before the first run', () => {
    const log: string[] = []
    const runs = new Runs<HeldRun>(() => undefined)
    void soundForPress(runs, runs.nextPlay(), fakeAudio(log))
    expect(log).toEqual(['open'])
  })

  it('leaves the sound to the new run once it replaced the paused one', async () => {
    const log: string[] = []
    const { runs, ticket } = pageWith(heldRun(log, 'old', true))
    const press = soundForPress(runs, ticket, fakeAudio(log))
    runs.replace(heldRun(log, 'new', false))
    await press.settle()
    expect(log).toEqual(['mute old', 'open'])
  })

  // A Start that began no run, such as one whose new dump failed: the paused run keeps its sound,
  // and the context stops running under it.
  it('suspends the context, then gives the paused run its sound back, when no run replaced it', async () => {
    const log: string[] = []
    const { runs, ticket } = pageWith(heldRun(log, 'old', true))
    await soundForPress(runs, ticket, fakeAudio(log)).settle()
    expect(log).toEqual(['mute old', 'open', 'suspend', 'unmute old'])
  })

  it('gives the sound back at once to a run that Play took on during the wait', async () => {
    const log: string[] = []
    const old = heldRun(log, 'old', true)
    const { runs, ticket } = pageWith(old)
    const press = soundForPress(runs, ticket, fakeAudio(log))
    old.clock.play(1000)
    await press.settle()
    expect(log).toEqual(['mute old', 'open', 'unmute old'])
  })

  it('leaves the end to a newer press', async () => {
    const log: string[] = []
    const { runs, ticket } = pageWith(heldRun(log, 'old', true))
    const first = soundForPress(runs, ticket, fakeAudio(log))
    runs.nextPlay()
    await first.settle()
    expect(log).toEqual(['mute old', 'open'])
  })
})
