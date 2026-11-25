import { describe, expect, it } from 'vitest'

import { FetchError } from './fetch'
import { loadedFrom, pickedFrom, type PickView, showPick } from './pick-lines'
import { createReplayChoice, type ReplaySummary } from './replay-choice'
import { TEST_REPLAYS } from './replays'
import type { VisitorLine } from './visitor'

const PLAYED = 'smogtours-gen3ou-994052'
const UNREACHABLE =
  'The page could not reach replay.pokemonshowdown.com. Check your connection and try again.'

/** A page that records what the flow shows on its status line, as replay-view.ts writes it. */
function recordingView() {
  const lines: VisitorLine[] = []
  const view: PickView = {
    testReplay: { selectedIndex: 0 },
    showReplay: () => undefined,
    keepPick: () => undefined,
    restorePick: () => undefined,
    status: (line) => lines.push({ line, detail: '', report: false }),
    visitorLine: (shown) => lines.push(shown),
  }
  return { view, lines, shown: () => lines.at(-1) }
}

/** A choice whose Load of a link gets no answer from Showdown. */
const offline = () =>
  createReplayChoice(() =>
    Promise.reject(new FetchError('no answer', 'https://replay.pokemonshowdown.com/gen3ou-1.json')),
  )

const example = (id: string) => {
  const found = TEST_REPLAYS.find((replay) => replay.id === id)
  if (found === undefined) throw new Error(`no test replay ${id}`)
  return found
}

describe('the line of a failed pick', () => {
  it('says that the game plays on with the replay it plays', async () => {
    const { view, shown } = recordingView()
    await showPick(view, offline().loadReplay('gen3ou-1'), () => PLAYED, loadedFrom(view))
    expect(shown()).toMatchObject({
      line: `${UNREACHABLE} The game plays on with ${PLAYED}.`,
      report: false,
      replay: 'gen3ou-1',
    })
  })

  it('names no game while none plays', async () => {
    const { view, shown } = recordingView()
    await showPick(view, offline().loadReplay('gen3ou-1'), () => undefined, loadedFrom(view))
    expect(shown()?.line).toBe(UNREACHABLE)
  })

  // A game id comes from other people's files, so the line holds 120 characters of it.
  it('cuts a long id of the game that plays to 120 characters', async () => {
    const { view, shown } = recordingView()
    const long = 'x'.repeat(5000)
    await showPick(view, offline().loadReplay('gen3ou-1'), () => long, loadedFrom(view))
    expect(shown()?.line).toContain(`The game plays on with ${'x'.repeat(119)}….`)
  })

  it('goes with the next pick, which asks for Start and leaves nothing under "Details"', async () => {
    const { view, shown } = recordingView()
    const choice = offline()
    await showPick(view, choice.loadReplay('gen3ou-1'), () => PLAYED, loadedFrom(view))
    const next = 'smogtours-gen3ou-994086'
    const picked: Promise<ReplaySummary | undefined> = choice.pickTestReplay(example(next))
    await showPick(view, picked, () => PLAYED, pickedFrom(view))
    expect(shown()).toEqual({
      line: `Picked ${next}. Press Start to play it.`,
      detail: '',
      report: false,
    })
  })
})
