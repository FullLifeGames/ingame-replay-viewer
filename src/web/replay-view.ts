// The replay controls both pages share (#52): the test replay select, the form "Replay link or ID"
// and the "Not shown in the game" list under the game. A pick or a Load fills the list before
// Start; the texts come from status.ts, and the flow's rules from replay-choice.ts.
import { messageOf } from './message'
import type { ReplayChoice, ReplaySummary } from './replay-choice'
import { FIRST_REPLAY, TEST_REPLAYS } from './replays'
import { countText, notShownHeading, pickedLine, replayLine, rowText } from './status'

/** The element `#id` of `page`, which must be a `type`. */
export function element<T extends HTMLElement>(page: string, id: string, type: new () => T): T {
  const found = document.getElementById(id)
  if (!(found instanceof type)) throw new Error(`${page} lacks the ${type.name} #${id}`)
  return found
}

function fill(list: HTMLElement, texts: readonly string[]): void {
  list.replaceChildren(
    ...texts.map((text) => Object.assign(document.createElement('li'), { textContent: text })),
  )
}

/** The replay controls of `page`, and the call that shows a replay's summary and list. */
export function findReplayView(page: string) {
  const testReplay = element(page, 'test-replay', HTMLSelectElement)
  return {
    testReplay,
    replayForm: element(page, 'replay-form', HTMLFormElement),
    replayInput: element(page, 'replay-input', HTMLInputElement),
    offer: (ids: readonly string[], first: string): void => {
      testReplay.replaceChildren(...ids.map((id) => new Option(id, id, false, id === first)))
    },
    showReplay: (summary: ReplaySummary): void => {
      element(page, 'replay-summary', HTMLParagraphElement).textContent = replayLine(summary)
      element(page, 'not-shown', HTMLHeadingElement).textContent = notShownHeading(
        summary.rows.length,
      )
      fill(element(page, 'not-shown-counts', HTMLUListElement), summary.counts.map(countText))
      fill(element(page, 'not-shown-rows', HTMLOListElement), summary.rows.map(rowText))
    },
  }
}

type ReplayView = ReturnType<typeof findReplayView>

/** What the controls ask of a page's flow: the session's or the WebAssembly page's picks. */
type ReplayChooser = Pick<ReplayChoice, 'pickTestReplay' | 'loadReplay'>

/**
 * Offers the test replays and picks the first, so the list shows at once; a later pick or Load
 * shows its list and asks for Start. A failure becomes the status line.
 */
export function wireReplays(
  chooser: ReplayChooser,
  view: ReplayView & { readonly status: (line: string) => void },
): void {
  type Then = (summary: ReplaySummary) => void
  const show = (pending: Promise<ReplaySummary | undefined>, then?: Then): void => {
    pending
      .then((summary) => {
        if (summary === undefined) return
        view.showReplay(summary)
        then?.(summary)
      })
      .catch((error: unknown) => {
        view.status(messageOf(error))
      })
  }
  const picked: Then = (summary) => {
    view.status(pickedLine(summary.id))
  }
  const pick = (id: string, then?: Then): void => {
    const replay = TEST_REPLAYS.find((test) => test.id === id)
    if (replay !== undefined) show(chooser.pickTestReplay(replay), then)
  }
  view.testReplay.addEventListener('change', () => {
    pick(view.testReplay.value, picked)
  })
  view.replayForm.addEventListener('submit', (event) => {
    event.preventDefault()
    show(chooser.loadReplay(view.replayInput.value), (summary) => {
      view.testReplay.selectedIndex = -1
      picked(summary)
    })
  })
  view.offer(
    TEST_REPLAYS.map((test) => test.id),
    FIRST_REPLAY,
  )
  pick(FIRST_REPLAY)
}
