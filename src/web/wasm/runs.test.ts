import { describe, expect, it } from 'vitest'

import { Runs } from './runs'

function setUp() {
  const stopped: string[] = []
  return { runs: new Runs<string>((run) => stopped.push(run)), stopped }
}

describe("the viewer's runs", () => {
  it('stops the current run when another replaces it, so one at most is live', () => {
    const { runs, stopped } = setUp()
    runs.replace('first')
    runs.replace('second')
    expect(runs.current).toBe('second')
    expect(stopped).toEqual(['first'])
    expect(runs.counts).toEqual({ started: 2, live: 1 })
  })

  // Two Start presses during the module build wait for the same build; the later one runs.
  it('lets only the newest play start a run after its waits', () => {
    const { runs } = setUp()
    const first = runs.nextPlay()
    const second = runs.nextPlay()
    expect(runs.isNewest(first)).toBe(false)
    expect(runs.isNewest(second)).toBe(true)
  })

  // The build's "Press Start" line must not land after a run that waited for the build.
  it('tells whether a run started since a mark', () => {
    const { runs } = setUp()
    const mark = runs.mark()
    expect(runs.startedSince(mark)).toBe(false)
    runs.replace('run')
    expect(runs.startedSince(mark)).toBe(true)
    expect(runs.startedSince(runs.mark())).toBe(false)
  })
})
