// The game the emulator page names after a failed pick (#69): the replay its last Start ran, until
// the core crashed or a Start took the game down.
import { describe, expect, it } from 'vitest'

import { playingOf, type PickView, showPick } from './pick-lines'
import type { VisitorLine } from './visitor'
import { OTHER_DUMP, ready, world } from './session-testing'

const PLAYED = 'smogtours-gen3ou-994052'

/** A page that keeps the last visitor line the flow showed. */
function recordingView() {
  const lines: VisitorLine[] = []
  const view: PickView = {
    testReplay: { selectedIndex: 0 },
    showReplay: () => undefined,
    keepPick: () => undefined,
    restorePick: () => undefined,
    status: () => undefined,
    visitorLine: (shown) => lines.push(shown),
  }
  return { view, shown: () => lines.at(-1) }
}

describe('a failed pick on the emulator page', () => {
  it('says that the game plays on with the replay the emulator runs', async () => {
    const { session } = world()
    await ready(session)
    await session.start()
    const { view, shown } = recordingView()
    await showPick(view, session.loadReplay('smogtours-gen3ou-1'), playingOf(session))
    expect(shown()).toMatchObject({
      line: `Showdown has no replay with this ID. The game plays on with ${PLAYED}.`,
    })
  })

  it('names no game before the first Start', async () => {
    const { session } = world()
    await ready(session)
    const { view, shown } = recordingView()
    await showPick(view, session.loadReplay('smogtours-gen3ou-1'), playingOf(session))
    expect(shown()).toMatchObject({ line: 'Showdown has no replay with this ID.' })
  })
})

describe("the session's game", () => {
  it('is the replay the last Start ran, through a Restart', async () => {
    const { session } = world()
    await ready(session)
    expect(session.playing()).toBeUndefined()
    await session.start()
    session.restart()
    expect(session.playing()).toBe(PLAYED)
  })

  it('is gone once the core crashed', async () => {
    const { session, crashNow } = world()
    await ready(session)
    await session.start()
    crashNow('The emulator crashed. Press Start to run the replay again.')
    expect(session.playing()).toBeUndefined()
  })

  // The adapter quits the running game before it loads the next ROM.
  it('is gone once the emulator refused the next ROM', async () => {
    const { session, log } = world()
    await ready(session)
    await session.start()
    log.refuseRun = true
    await expect(session.start()).rejects.toThrow()
    expect(session.playing()).toBeUndefined()
  })

  it('plays on when a Start fails before it reached the emulator', async () => {
    const { session } = world()
    await ready(session)
    await session.start()
    await expect(session.pickDump(OTHER_DUMP)).rejects.toThrow()
    await expect(session.start()).rejects.toThrow()
    expect(session.playing()).toBe(PLAYED)
  })
})
