import { describe, expect, it } from 'vitest'

import { Runs } from './runs'
import { pressStart } from './start-press'

/** A build that ends when the spec says so, as the module's build ends after the dump's read. */
function deferredBuild() {
  let end: () => void = () => undefined
  let fail: (error: Error) => void = () => undefined
  const built = new Promise<void>((resolve, reject) => {
    end = resolve
    fail = reject
  })
  return { built, end, fail }
}

/** The viewer's play as main.ts runs it: it waits for the build, then the newest play starts a run. */
function setUp() {
  const runs = new Runs<string>(() => undefined)
  const build = deferredBuild()
  const play = async (): Promise<string | undefined> => {
    const ticket = runs.nextPlay()
    await build.built
    if (!runs.isNewest(ticket)) return undefined
    runs.replace(`run ${String(ticket)}`)
    return 'Running'
  }
  return { runs, build, play, button: { disabled: false } }
}

describe('a press on Start', () => {
  it('disables Start until the run begins, so a second press during the build starts no run', async () => {
    const { runs, build, play, button } = setUp()
    const first = pressStart(button, play, 1)
    expect(button.disabled).toBe(true)
    const second = pressStart(button, play, 1)
    build.end()
    expect(await first).toBe('Running')
    expect(await second).toBeUndefined()
    expect(runs.counts).toEqual({ started: 1, live: 1 })
    expect(runs.current).toBe('run 1')
    expect(button.disabled).toBe(false)
  })

  it('enables Start again when the start fails, and hands the failure on', async () => {
    const { runs, build, play, button } = setUp()
    const pressed = pressStart(button, play, 1)
    expect(button.disabled).toBe(true)
    build.fail(new Error('the build failed'))
    await expect(pressed).rejects.toThrow('the build failed')
    expect(button.disabled).toBe(false)
    expect(runs.counts).toEqual({ started: 0, live: 0 })
  })

  // A press after the run began restarts the run by design.
  it('lets a press after the run began start the run over', async () => {
    const { runs, build, play, button } = setUp()
    build.end()
    await pressStart(button, play, 1)
    await pressStart(button, play, 1)
    expect(runs.counts).toEqual({ started: 2, live: 1 })
  })

  // #90 D5: the second click of a double click has a detail of 2; it would restart the new run.
  it('plays nothing on the second click of a double click, and leaves Start as it was', async () => {
    const { runs, build, play, button } = setUp()
    build.end()
    await pressStart(button, play, 1)
    expect(await pressStart(button, play, 2)).toBeUndefined()
    expect(await pressStart(button, play, 3)).toBeUndefined()
    expect(button.disabled).toBe(false)
    expect(runs.counts).toEqual({ started: 1, live: 1 })
  })

  // A key press on the button (Enter or Space) clicks it with a detail of 0.
  it('plays on a key press', async () => {
    const { runs, build, play, button } = setUp()
    build.end()
    expect(await pressStart(button, play, 0)).toBe('Running')
    expect(runs.counts).toEqual({ started: 1, live: 1 })
  })
})
